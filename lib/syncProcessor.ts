import { listarPedidosTiny, listarPedidosTinyPorPeriodo, TinyApiError, TinyPedidoListaItem } from './tinyApi';
import { supabaseAdmin } from './supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from './tinyAuth';
import { extrairDataISO, normalizarCanalTiny, parseValorTiny } from './tinyMapping';

const DAY_MS = 24 * 60 * 60 * 1000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processJob(jobId: string) {
  let totalRequests = 0;
  let totalOrders = 0;
  try {
    const { data: jobRow, error: jobFetchErr } = await supabaseAdmin
      .from('sync_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (jobFetchErr) throw jobFetchErr;
    if (!jobRow) throw new Error('Job não encontrado');

    const params = jobRow.params ?? {};
    const mode = params.mode || 'range';
    const dataInicialISO = params.dataInicial;
    const dataFinalISO = params.dataFinal;

    const limit = 100;
    const envMax = Number(process.env.PROCESS_MAX_REQUESTS || '0') || 0;
    const defaultMax = mode === 'full' ? 2000 : 1000;
    const MAX_REQUESTS = envMax > 0 ? envMax : defaultMax;

    const accessToken = await getAccessTokenFromDbOrRefresh();

    await supabaseAdmin
      .from('sync_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', jobId);

    // Se houver período definido, faça varredura por janelas para garantir cobertura completa
    if (dataInicialISO && dataFinalISO) {
      const batchDays = Number(process.env.PROCESS_BATCH_DAYS || '3') || 3;
      const start = new Date(`${dataInicialISO}T00:00:00`);
      const end = new Date(`${dataFinalISO}T00:00:00`);
      let cursor = new Date(start);

      while (cursor.getTime() <= end.getTime()) {
        // Parar se atingimos o limite de requisições
        if (totalRequests >= MAX_REQUESTS) {
          await supabaseAdmin.from('sync_logs').insert({ 
            job_id: jobId, 
            level: 'warn', 
            message: 'Limite de requisições atingido; parando chunking', 
            meta: { totalRequests, MAX_REQUESTS } 
          });
          break;
        }

        const janelaIni = new Date(cursor);
        const janelaFim = new Date(Math.min(cursor.getTime() + (batchDays - 1) * DAY_MS, end.getTime()));
        const janelaIniStr = janelaIni.toISOString().slice(0, 10);
        const janelaFimStr = janelaFim.toISOString().slice(0, 10);

        await supabaseAdmin.from('sync_logs').insert({ 
          job_id: jobId, 
          level: 'info', 
          message: `Processando janela [${janelaIniStr} até ${janelaFimStr}]`, 
          meta: { janelaIni: janelaIniStr, janelaFim: janelaFimStr, janelaDias: batchDays } 
        });

        // Paginação da janela atual
        let offset = 0;
        let totalAPIJanela = 0;
        let janelaAcabou = false;
        let pagesJanela = 0;

        while (!janelaAcabou && totalRequests < MAX_REQUESTS) {
          let page: { itens?: TinyPedidoListaItem[]; paginacao?: any } | null = null;
          let attempt429 = 0;
          const MAX_429_ATTEMPTS = 8;

          while (page === null && attempt429 <= MAX_429_ATTEMPTS) {
            try {
              page = await listarPedidosTinyPorPeriodo(accessToken!, {
                dataInicial: janelaIniStr,
                dataFinal: janelaFimStr,
                limit,
                offset,
                orderBy: 'desc',
              });
              totalRequests++;
              pagesJanela++;
            } catch (err: any) {
              if (err instanceof TinyApiError && err.status === 429) {
                attempt429 += 1;
                if (attempt429 > MAX_429_ATTEMPTS) {
                  await supabaseAdmin.from('sync_logs').insert({ 
                    job_id: jobId, 
                    level: 'error', 
                    message: 'Muitas respostas 429; abortando janela', 
                    meta: { janelaIni: janelaIniStr, janelaFim: janelaFimStr, attempts: attempt429 } 
                  });
                  throw err;
                }
                const backoff = Math.min(15000 * Math.pow(2, attempt429 - 1), 60000);
                await supabaseAdmin.from('sync_logs').insert({ 
                  job_id: jobId, 
                  level: 'warn', 
                  message: `429 do Tiny — aguardando ${backoff}ms`, 
                  meta: { janela: `${janelaIniStr}/${janelaFimStr}`, attempt: attempt429 } 
                });
                await sleep(backoff);
                continue;
              }
              if (err instanceof TinyApiError && err.status === 400) {
                // Fallback para listagem genérica com filtro client-side
                await supabaseAdmin.from('sync_logs').insert({ 
                  job_id: jobId, 
                  level: 'warn', 
                  message: 'Tiny rejeitou período (400); usando listagem genérica', 
                  meta: { janela: `${janelaIniStr}/${janelaFimStr}` } 
                });
                page = await listarPedidosTiny(accessToken!, { limit, offset, orderBy: 'desc' });
                totalRequests++;
                pagesJanela++;
              } else {
                await supabaseAdmin.from('sync_logs').insert({ 
                  job_id: jobId, 
                  level: 'error', 
                  message: 'Erro ao chamar Tiny (janela)', 
                  meta: { janela: `${janelaIniStr}/${janelaFimStr}`, error: err?.message ?? String(err) } 
                });
                throw err;
              }
            }
          }

          if (janelaAcabou) break;

          const itens: TinyPedidoListaItem[] = (page as any).itens ?? [];
          if (!itens.length) break;

          const pag = (page as any).paginacao;
          if (pag && typeof pag.total === 'number') totalAPIJanela = pag.total;

          // Mapear e filtrar pedidos da janela
          const rows = itens
            .map((p) => {
              const canalBruto = (p as any).canalVenda ?? (p as any).ecommerce?.nome ?? null;
              const canalNormalizado = normalizarCanalTiny(canalBruto);
              return {
                tiny_id: (p as any).id ?? null,
                numero_pedido: (p as any).numeroPedido ?? (p as any).numero ?? null,
                situacao: (p as any).situacao ?? null,
                data_criacao: extrairDataISO((p as any).dataCriacao ?? null),
                valor: parseValorTiny((p as any).valor ?? null),
                canal: canalNormalizado,
                cliente_nome: (p as any).cliente?.nome ?? null,
                raw: p,
              };
            })
            .filter((r) => r.data_criacao && r.data_criacao >= janelaIniStr && r.data_criacao <= janelaFimStr);

          const validRows = rows.filter((r) => r.tiny_id && r.data_criacao);
          const descartados = rows.length - validRows.length;

          if (validRows.length) {
            const { error: upsertError } = await supabaseAdmin.from('tiny_orders').upsert(validRows as any[], { onConflict: 'tiny_id' });
            if (upsertError) {
              await supabaseAdmin.from('sync_logs').insert({ 
                job_id: jobId, 
                level: 'error', 
                message: 'Erro ao salvar pedidos (janela)', 
                meta: { janela: `${janelaIniStr}/${janelaFimStr}`, error: upsertError.message } 
              });
              throw upsertError;
            }
            totalOrders += validRows.length;
            await supabaseAdmin.from('sync_logs').insert({ 
              job_id: jobId, 
              level: 'info', 
              message: `Janela: salvos ${validRows.length} pedidos`, 
              meta: { janela: `${janelaIniStr}/${janelaFimStr}`, salvos: validRows.length, descartados, totalOrders } 
            });
          } else {
            await supabaseAdmin.from('sync_logs').insert({ 
              job_id: jobId, 
              level: 'info', 
              message: `Janela: nenhum pedido válido`, 
              meta: { janela: `${janelaIniStr}/${janelaFimStr}`, recebidos: itens.length, descartados } 
            });
          }

          offset += itens.length;
          if (totalAPIJanela && offset >= totalAPIJanela) janelaAcabou = true;
          if (!janelaAcabou) await sleep(500);
        }

        await supabaseAdmin.from('sync_logs').insert({ 
          job_id: jobId, 
          level: 'info', 
          message: `Janela completa`, 
          meta: { janela: `${janelaIniStr}/${janelaFimStr}`, pages: pagesJanela } 
        });

        cursor = new Date(janelaFim.getTime() + DAY_MS);
      }

      await supabaseAdmin.from('sync_jobs').update({ 
        status: 'finished', 
        finished_at: new Date().toISOString(), 
        total_requests: totalRequests, 
        total_orders: totalOrders 
      }).eq('id', jobId);

      await supabaseAdmin.from('sync_logs').insert({ 
        job_id: jobId, 
        level: 'info', 
        message: 'Sync por período (chunking) finalizado com sucesso', 
        meta: { totalRequests, totalOrders } 
      });

      return { ok: true, jobId, totalRequests, totalOrders };
    }

    // Fallback: se não houver período ou se foi quebrado, usar listagem genérica com paginação simples
    await supabaseAdmin.from('sync_logs').insert({ 
      job_id: jobId, 
      level: 'info', 
      message: 'Usando listagem genérica de pedidos' 
    });

    let offset = 0;
    let totalAPI = 0;
    let acabou = false;
    let pages = 0;

    while (!acabou && totalRequests < MAX_REQUESTS) {
      let page: { itens?: TinyPedidoListaItem[]; paginacao?: any } | null = null;
      let attempt429 = 0;
      const MAX_429_ATTEMPTS = 8;

      while (page === null && attempt429 <= MAX_429_ATTEMPTS) {
        try {
          page = await listarPedidosTiny(accessToken!, { limit, offset, orderBy: 'desc' });
          totalRequests++;
          pages++;
        } catch (err: any) {
          if (err instanceof TinyApiError && err.status === 429) {
            attempt429 += 1;
            if (attempt429 > MAX_429_ATTEMPTS) {
              await supabaseAdmin.from('sync_logs').insert({ 
                job_id: jobId, 
                level: 'error', 
                message: 'Muitas respostas 429; abortando', 
                meta: { attempt429 } 
              });
              throw err;
            }
            const backoff = Math.min(15000 * Math.pow(2, attempt429 - 1), 60000);
            await supabaseAdmin.from('sync_logs').insert({ 
              job_id: jobId, 
              level: 'warn', 
              message: `429 do Tiny — aguardando ${backoff}ms`, 
              meta: { attempt: attempt429 } 
            });
            await sleep(backoff);
            continue;
          }
          await supabaseAdmin.from('sync_logs').insert({ 
            job_id: jobId, 
            level: 'error', 
            message: 'Erro ao chamar Tiny', 
            meta: { error: err?.message ?? String(err) } 
          });
          throw err;
        }
      }

      if (acabou) break;

      const itens: TinyPedidoListaItem[] = (page as any).itens ?? [];
      if (!itens.length) {
        await supabaseAdmin.from('sync_logs').insert({ 
          job_id: jobId, 
          level: 'info', 
          message: 'Sem mais pedidos retornados pelo Tiny' 
        });
        break;
      }

      const pag = (page as any).paginacao;
      if (pag && typeof pag.total === 'number') totalAPI = pag.total;

      const rows = itens.map((p) => {
        const canalBruto = (p as any).canalVenda ?? (p as any).ecommerce?.nome ?? null;
        const canalNormalizado = normalizarCanalTiny(canalBruto);

        return {
          tiny_id: (p as any).id ?? null,
          numero_pedido: (p as any).numeroPedido ?? (p as any).numero ?? null,
          situacao: (p as any).situacao ?? null,
          data_criacao: extrairDataISO((p as any).dataCriacao ?? null),
          valor: parseValorTiny((p as any).valor ?? null),
          canal: canalNormalizado,
          cliente_nome: (p as any).cliente?.nome ?? null,
          raw: p,
        };
      });

      const validRows = rows.filter((r) => r.tiny_id && r.data_criacao);

      if (validRows.length) {
        const { error: upsertError } = await supabaseAdmin.from('tiny_orders').upsert(validRows as any[], { onConflict: 'tiny_id' });
        if (upsertError) {
          await supabaseAdmin.from('sync_logs').insert({ 
            job_id: jobId, 
            level: 'error', 
            message: 'Erro ao salvar pedidos no banco', 
            meta: { error: upsertError.message } 
          });
          throw upsertError;
        }

        totalOrders += validRows.length;
        await supabaseAdmin.from('sync_logs').insert({ 
          job_id: jobId, 
          level: 'info', 
          message: 'Pedidos salvos no banco', 
          meta: { quantidade: validRows.length, descartados: rows.length - validRows.length, totalOrders } 
        });
      }

      offset += itens.length;
      if (totalAPI && offset >= totalAPI) acabou = true;
      if (!acabou) await sleep(700);
    }

    await supabaseAdmin.from('sync_jobs').update({ 
      status: 'finished', 
      finished_at: new Date().toISOString(), 
      total_requests: totalRequests, 
      total_orders: totalOrders 
    }).eq('id', jobId);

    await supabaseAdmin.from('sync_logs').insert({ 
      job_id: jobId, 
      level: 'info', 
      message: 'Sync finalizado com sucesso', 
      meta: { totalRequests, totalOrders } 
    });

    // Enrichment is now handled by dedicated cron job: /api/tiny/sync/enrich-background
    // This runs every 5 minutes and processes unenriched orders independently

    return { ok: true, jobId, totalRequests, totalOrders };
  } catch (err: any) {
    // mark job as error
    try {
      if (jobId) {
        await supabaseAdmin.from('sync_jobs').update({ status: 'error', finished_at: new Date().toISOString(), error: err?.message ?? 'Erro desconhecido' }).eq('id', jobId);
        await supabaseAdmin.from('sync_logs').insert({ job_id: jobId, level: 'error', message: 'Job finalizado com erro', meta: { error: err?.message ?? String(err) } });
      }
    } catch (e) {
      console.error('Erro ao marcar job como erro', e);
    }

    return { ok: false, message: err?.message ?? String(err) };
  }
}

export default processJob;
