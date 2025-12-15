// @ts-nocheck
import { listarPedidosTiny, listarPedidosTinyPorPeriodo, obterPedidoDetalhado, TinyApiError, TinyPedidoListaItem } from './tinyApi';
import { supabaseAdmin } from './supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from './tinyAuth';
import { filtrarEMapearPedidos, mapPedidoToOrderRow, extrairFreteFromRaw } from './tinyMapping';
import { runFreteEnrichment } from './freteEnricher';
import { normalizeMissingOrderChannels } from './channelNormalizer';
import { enrichOrdersBatch } from './orderEnricher';
import { salvarItensPedidoDetalhe, sincronizarItensAutomaticamente, sincronizarItensPorPedidos } from './pedidoItensHelper';

const DAY_MS = 24 * 60 * 60 * 1000;
const FRETE_MAX_PASSES = Number(process.env.FRETE_ENRICH_MAX_PASSES ?? '5');
const ENABLE_INLINE_FRETE_ENRICHMENT = process.env.ENABLE_INLINE_FRETE_ENRICHMENT === 'true'; // Desabilitado por padrão devido a rate limits
const RECENT_BACKLOG_DAYS = Number(process.env.RECENT_BACKLOG_DAYS ?? '7') || 7;
const RECENT_ENRICH_DELAY_MS = Number(process.env.RECENT_ENRICH_DELAY_MS ?? '750') || 750;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upsert inteligente: preserva campos enriquecidos (valor_frete, canal) se já existirem
 * EXPORTADA para uso em cron jobs
 */
export async function upsertOrdersPreservingEnriched(rows: any[]) {
  if (!rows.length) return { error: null };

  const payloadHasItens = (payload: any): boolean => {
    if (!payload || typeof payload !== 'object') return false;
    const itens = (payload as any).itens;
    const itensPedido = (payload as any).itensPedido;
    const nestedItens = (payload as any).pedido?.itens;
    const nestedItensPedido = (payload as any).pedido?.itensPedido;
    return (
      Array.isArray(itens) ||
      Array.isArray(itensPedido) ||
      Array.isArray(nestedItens) ||
      Array.isArray(nestedItensPedido)
    );
  };

  // Buscar pedidos existentes
  const tinyIds = rows.map(r => r.tiny_id);
  const { data: existing } = await supabaseAdmin
    .from('tiny_orders')
    .select('tiny_id, valor_frete, canal, cidade, uf, raw_payload, is_enriched')
    .in('tiny_id', tinyIds);

  const existingMap = new Map(
    (existing || []).map(e => [e.tiny_id, { 
      valor_frete: e.valor_frete, 
      canal: e.canal, 
      cidade: (e as any).cidade, 
      uf: (e as any).uf,
      raw_payload: (e as any).raw_payload,
      is_enriched: (e as any).is_enriched,
    }])
  );

  // Mesclar: preservar valor_frete e canal enriquecidos
  const mergedRows = rows.map(row => {
    const exists = existingMap.get(row.tiny_id);
    if (!exists) return row; // Novo pedido, usar como está

    const keepDetalhe = payloadHasItens(exists.raw_payload);
    const mergedIsEnriched = (exists.is_enriched === true) ? true : (row.is_enriched ?? exists.is_enriched ?? null);

    return {
      ...row,
      // Preservar valor_frete se já existe e é maior que zero
      valor_frete: (exists.valor_frete && exists.valor_frete > 0) 
        ? exists.valor_frete 
        : row.valor_frete,
      // Preservar canal se já existe e não é "Outros"
      canal: (exists.canal && exists.canal !== 'Outros') 
        ? exists.canal 
        : row.canal,
      // Preservar cidade/uf já enriquecidos (não sobrescrever por nulo)
      cidade: exists.cidade ?? row.cidade,
      uf: exists.uf ?? row.uf,

      // Nunca sobrescrever detalhe (raw_payload com itens) por payload lite.
      // Se já existe detalhe, mantém.
      raw_payload: keepDetalhe
        ? exists.raw_payload
        : (row.raw_payload ?? exists.raw_payload ?? null),

      // Se já foi enriquecido, preserva.
      is_enriched: mergedIsEnriched,
    };
  });

  return await supabaseAdmin
    .from('tiny_orders')
    .upsert(mergedRows, { onConflict: 'tiny_id' });
}

async function enrichFreteRange(opts: {
  startDate?: string;
  endDate?: string;
  newestFirst?: boolean;
  jobId?: string | null;
  context: string;
}) {
  const { startDate, endDate, newestFirst = true, jobId = null, context } = opts; // newestFirst=true por padrão
  const passes = Math.max(1, FRETE_MAX_PASSES);
  for (let pass = 0; pass < passes; pass++) {
    const result = await runFreteEnrichment({
      startDate,
      endDate,
      newestFirst,
      limit: 100, // Mais pedidos por vez
      batchSize: 10, // Lotes maiores
      batchDelayMs: 2000, // Delay de 2s entre lotes
    });

    if (jobId) {
      await supabaseAdmin.from('sync_logs').insert({
        job_id: jobId,
        level: 'info',
        message: `Frete enrichment (${context}) pass ${pass + 1}`,
        meta: {
          requested: result.requested,
          updated: result.updated,
          remaining: result.remaining,
          newestProcessed: result.newestProcessed,
          oldestProcessed: result.oldestProcessed,
        },
      });
    }

    if (!result.requested || result.remaining === 0) {
      break;
    }
    
    // Se falhou muito, aumenta delay antes do próximo pass
    if (result.failed > result.updated * 2) {
      await sleep(5000);
    }
  }
}

async function normalizeChannels(jobId: string | null, context: string) {
  try {
    const result = await normalizeMissingOrderChannels({ includeOutros: true });
    if (jobId) {
      await supabaseAdmin.from('sync_logs').insert({
        job_id: jobId,
        level: 'info',
        message: `Normalização de canais (${context})`,
        meta: result,
      });
    }
  } catch (error: any) {
    const meta = { context, error: error?.message ?? String(error) };
    if (jobId) {
      await supabaseAdmin.from('sync_logs').insert({
        job_id: jobId,
        level: 'warn',
        message: 'Falha ao normalizar canais',
        meta,
      });
    } else {
      console.warn('[syncProcessor] Falha ao normalizar canais', meta);
    }
  }
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

    const payloadHasItens = (payload: any): boolean => {
      if (!payload || typeof payload !== 'object') return false;
      return (
        Array.isArray((payload as any).itens) ||
        Array.isArray((payload as any).itensPedido) ||
        Array.isArray((payload as any).pedido?.itens) ||
        Array.isArray((payload as any).pedido?.itensPedido)
      );
    };

    const normalizePedidoDetalhadoPayload = (payload: any): any => {
      if (!payload || typeof payload !== 'object') return payload;
      if (!Array.isArray((payload as any).itens) && Array.isArray((payload as any).pedido?.itens)) {
        return { ...(payload as any), itens: (payload as any).pedido.itens };
      }
      if (!Array.isArray((payload as any).itensPedido) && Array.isArray((payload as any).pedido?.itensPedido)) {
        return { ...(payload as any), itensPedido: (payload as any).pedido.itensPedido };
      }
      return payload;
    };

    const enrichPedidosFromTinyIds = async (
      tinyIds: number[],
      opts: { context: string; reason: string; criteria?: 'full' | 'missing_items_only' }
    ) => {
      const uniqueTinyIds = Array.from(new Set(tinyIds.filter((id) => Number.isFinite(id))));
      if (!uniqueTinyIds.length) return;

      const { data: orders } = await supabaseAdmin
        .from('tiny_orders')
        .select('id, tiny_id, is_enriched, raw_payload')
        .in('tiny_id', uniqueTinyIds);

      if (!orders?.length) return;

      const orderIds = orders.map((o: any) => o.id);
      const { data: itensRows } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .select('id_pedido')
        .in('id_pedido', orderIds);
      const idsComItens = new Set((itensRows ?? []).map((r: any) => r.id_pedido));

      const candidatos = orders.filter((o: any) => {
        const precisaPorFlag = o.is_enriched === null || o.is_enriched === false;
        const semItens = !idsComItens.has(o.id);
        const semItensNoPayload = !payloadHasItens(o.raw_payload);
        if (opts.criteria === 'missing_items_only') {
          return semItens;
        }
        return precisaPorFlag || semItens || semItensNoPayload;
      });

      if (!candidatos.length) return;

      await supabaseAdmin.from('sync_logs').insert({
        job_id: jobId,
        level: 'info',
        message: 'Fase B (recent): enriquecendo pedidos via detalhe + itens',
        meta: { reason: opts.reason, candidatos: candidatos.length, total: orders.length },
      });

      for (const pedido of candidatos) {
        if (totalRequests >= MAX_REQUESTS) {
          await supabaseAdmin.from('sync_logs').insert({
            job_id: jobId,
            level: 'warn',
            message: 'Limite de requisições atingido; interrompendo Fase B',
            meta: { totalRequests, MAX_REQUESTS, reason: opts.reason },
          });
          break;
        }

        const tinyId = Number(pedido.tiny_id);
        if (!Number.isFinite(tinyId)) continue;

        let detalhe: any = null;
        let attempt429 = 0;
        const MAX_429_ATTEMPTS = 8;

        while (detalhe === null && attempt429 <= MAX_429_ATTEMPTS) {
          try {
            detalhe = await obterPedidoDetalhado(accessToken!, tinyId, opts.context);
            totalRequests++;
          } catch (err: any) {
            if (err instanceof TinyApiError && err.status === 429) {
              attempt429 += 1;
              if (attempt429 > MAX_429_ATTEMPTS) {
                await supabaseAdmin.from('sync_logs').insert({
                  job_id: jobId,
                  level: 'error',
                  message: 'Muitas respostas 429 ao obter detalhe do pedido; pulando pedido',
                  meta: { tinyId, localId: pedido.id, attempts: attempt429, reason: opts.reason },
                });
                detalhe = undefined;
                break;
              }
              const backoff = Math.min(15000 * Math.pow(2, attempt429 - 1), 60000);
              await supabaseAdmin.from('sync_logs').insert({
                job_id: jobId,
                level: 'warn',
                message: `429 do Tiny em pedido.obter — aguardando ${backoff}ms`,
                meta: { tinyId, localId: pedido.id, attempt: attempt429, reason: opts.reason },
              });
              await sleep(backoff);
              continue;
            }

            await supabaseAdmin.from('sync_logs').insert({
              job_id: jobId,
              level: 'warn',
              message: 'Falha ao obter detalhe do pedido (pedido.obter)',
              meta: { tinyId, localId: pedido.id, error: err?.message ?? String(err), reason: opts.reason },
            });
            detalhe = undefined;
            break;
          }
        }

        if (!detalhe) {
          await supabaseAdmin.from('tiny_orders').update({ is_enriched: false }).eq('id', pedido.id);
          await sleep(RECENT_ENRICH_DELAY_MS);
          continue;
        }

        const normalized = normalizePedidoDetalhadoPayload(detalhe);
        try {
          const result = await salvarItensPedidoDetalhe(accessToken!, tinyId, pedido.id, normalized, { context: opts.context });
          await supabaseAdmin.from('sync_logs').insert({
            job_id: jobId,
            level: result.itensSalvos === null ? 'warn' : 'info',
            message: 'Pedido enriquecido (detalhe + itens)',
            meta: {
              tinyId,
              localId: pedido.id,
              itensSalvos: result.itensSalvos,
              jaTinhaItens: result.jaTinhaItens,
              reason: opts.reason,
            },
          });
        } catch (err: any) {
          await supabaseAdmin.from('tiny_orders').update({ is_enriched: false }).eq('id', pedido.id);
          await supabaseAdmin.from('sync_logs').insert({
            job_id: jobId,
            level: 'error',
            message: 'Erro ao persistir itens do pedido após obter detalhe',
            meta: { tinyId, localId: pedido.id, error: err?.message ?? String(err), reason: opts.reason },
          });
        }

        await sleep(RECENT_ENRICH_DELAY_MS);
      }
    };

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
              }, 'cron_pedidos');
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
                page = await listarPedidosTiny(accessToken!, { limit, offset, orderBy: 'desc' }, 'cron_pedidos');
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

          // Enriquecer pedidos com detalhes (valorFrete) se habilitado
          let freteEnriquecidos = 0;
          if (ENABLE_INLINE_FRETE_ENRICHMENT && accessToken) {
            try {
              const freteMap = await enrichOrdersBatch(accessToken, itens, {
                batchSize: 5,
                delayMs: 500,
                skipIfHasFrete: true,
                context: 'cron_pedidos',
              });
              
              // Aplicar frete enriquecido aos itens (tanto no objeto quanto no raw)
              itens.forEach((item) => {
                if (item.id && freteMap.has(item.id)) {
                  const freteValue = freteMap.get(item.id);
                  (item as any).valorFrete = freteValue;
                  freteEnriquecidos++;
                }
              });

              if (freteEnriquecidos > 0) {
                await supabaseAdmin.from('sync_logs').insert({ 
                  job_id: jobId, 
                  level: 'info', 
                  message: `Enriquecimento inline: ${freteEnriquecidos} pedidos com frete`, 
                  meta: { janela: `${janelaIniStr}/${janelaFimStr}`, enriquecidos: freteEnriquecidos, total: itens.length } 
                });
              }
            } catch (enrichError: any) {
              await supabaseAdmin.from('sync_logs').insert({ 
                job_id: jobId, 
                level: 'warn', 
                message: 'Falha no enriquecimento inline de frete', 
                meta: { janela: `${janelaIniStr}/${janelaFimStr}`, error: enrichError?.message ?? String(enrichError) } 
              });
            }
          }

          const rows = filtrarEMapearPedidos(itens, {
            dataInicial: janelaIniStr,
            dataFinal: janelaFimStr,
          });

        const validRows = rows.filter((r) => r.tiny_id && r.data_criacao);
        const descartados = itens.length - validRows.length;

        if (validRows.length) {
          const { error: upsertError } = await upsertOrdersPreservingEnriched(validRows);
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
              meta: { janela: `${janelaIniStr}/${janelaFimStr}`, salvos: validRows.length, descartados, totalOrders, freteEnriquecidos } 
            });

            // Fase B (apenas para recent/repair): buscar detalhe + itens/produtos imediatamente.
            if ((mode === 'recent' || mode === 'repair') && accessToken) {
              try {
                const tinyIdsJanela = validRows.map((r: any) => Number(r.tiny_id)).filter((n: any) => Number.isFinite(n));
                await enrichPedidosFromTinyIds(tinyIdsJanela, { context: 'cron_pedidos', reason: `janela:${janelaIniStr}/${janelaFimStr}` });
              } catch (err: any) {
                await supabaseAdmin.from('sync_logs').insert({
                  job_id: jobId,
                  level: 'warn',
                  message: 'Falha na Fase B (recent): enriquecimento por janela',
                  meta: { janela: `${janelaIniStr}/${janelaFimStr}`, error: err?.message ?? String(err) },
                });
              }
            }
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

      await enrichFreteRange({
        startDate: dataInicialISO,
        endDate: dataFinalISO,
        newestFirst: false,
        jobId,
        context: 'range-sync',
      });

      await normalizeChannels(jobId, 'range-sync');

      // Backlog recente: reenriquece pedidos sem itens na janela de RECENT_BACKLOG_DAYS
      if ((mode === 'recent' || mode === 'repair') && accessToken) {
        try {
          const dataMinima = new Date();
          dataMinima.setDate(dataMinima.getDate() - RECENT_BACKLOG_DAYS);
          const dataMinimaStr = dataMinima.toISOString().slice(0, 10);

          const { data: recentes } = await supabaseAdmin
            .from('tiny_orders')
            .select('id, tiny_id')
            .gte('data_criacao', dataMinimaStr)
            .order('data_criacao', { ascending: false })
            .limit(500);

          const orderIds = (recentes ?? []).map((r: any) => r.id);
          const { data: itensRows } = await supabaseAdmin
            .from('tiny_pedido_itens')
            .select('id_pedido')
            .in('id_pedido', orderIds);
          const idsComItens = new Set((itensRows ?? []).map((r: any) => r.id_pedido));
          const missing = (recentes ?? []).filter((r: any) => !idsComItens.has(r.id));

          const tinyIdsBacklog = (missing ?? [])
            .map((r: any) => Number(r.tiny_id))
            .filter((n: any) => Number.isFinite(n));

          await enrichPedidosFromTinyIds(tinyIdsBacklog, {
            context: 'cron_pedidos',
            reason: `backlog_sem_itens:${RECENT_BACKLOG_DAYS}d`,
            criteria: 'missing_items_only',
          });
        } catch (err: any) {
          await supabaseAdmin.from('sync_logs').insert({
            job_id: jobId,
            level: 'warn',
            message: 'Falha ao reenriquecer backlog recente',
            meta: { backlogDays: RECENT_BACKLOG_DAYS, error: err?.message ?? String(err) },
          });
        }
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
          page = await listarPedidosTiny(accessToken!, { limit, offset, orderBy: 'desc' }, 'cron_pedidos');
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

      const rows = itens.map((p) => mapPedidoToOrderRow(p));

      const validRows = rows.filter((r) => r.tiny_id && r.data_criacao);

      if (validRows.length) {
        const { error: upsertError } = await upsertOrdersPreservingEnriched(validRows);
        if (upsertError) {
          await supabaseAdmin.from('sync_logs').insert({ 
            job_id: jobId, 
            level: 'error', 
            message: 'Erro ao salvar pedidos no banco', 
            meta: { error: upsertError.message } 
          });
          throw upsertError;
        }

        try {
          const tinyIds = validRows.map((r) => r.tiny_id as number);
          const itensResult = await sincronizarItensPorPedidos(
            accessToken!,
            tinyIds,
            { retries: 2, delayMs: 1200 }
          );

          let missing = Math.max(0, tinyIds.length - itensResult.sucesso);

          if (missing > 0) {
            // Fallback: roda sincronização automática restrita aos pedidos recentes
            const dataMinima = new Date();
            dataMinima.setDate(dataMinima.getDate() - 7);
            const fallback = await sincronizarItensAutomaticamente(accessToken, {
              limit: 120,
              maxRequests: 120,
              dataMinima,
            });
            missing = Math.max(0, missing - fallback.sucesso);
            await supabaseAdmin.from('sync_logs').insert({
              job_id: jobId,
              level: missing > 0 ? 'warning' : 'info',
              message: 'Fallback de itens executado para pedidos recém-importados',
              meta: { fallback, remainingMissing: missing },
            });
          }

          await supabaseAdmin.from('sync_logs').insert({
            job_id: jobId,
            level: 'info',
            message: 'Itens sincronizados para pedidos recém-importados',
            meta: { itensResult, missing },
          });
        } catch (error: any) {
          await supabaseAdmin.from('sync_logs').insert({
            job_id: jobId,
            level: 'warning',
            message: 'Erro ao sincronizar itens recém-importados',
            meta: { error: error?.message || String(error) },
          });
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

    await enrichFreteRange({
      newestFirst: true,
      jobId,
      context: 'generic-sync',
    });

    await normalizeChannels(jobId, 'generic-sync');

    // Sincronizar itens dos pedidos recém-sincronizados
    try {
      console.log('[Sync] Iniciando sincronização automática de itens...');
      const itensResult = await sincronizarItensAutomaticamente(accessToken, {
        limit: 100,
        maxRequests: 50,
      });
      
      await supabaseAdmin.from('sync_logs').insert({
        job_id: jobId,
        level: 'info',
        message: 'Itens sincronizados automaticamente',
        meta: itensResult,
      });
      
      console.log(`[Sync] Itens sincronizados: ${itensResult.totalItens} itens de ${itensResult.sucesso} pedidos`);
    } catch (error: any) {
      console.error('[Sync] Erro ao sincronizar itens automaticamente:', error);
      await supabaseAdmin.from('sync_logs').insert({
        job_id: jobId,
        level: 'warning',
        message: 'Erro ao sincronizar itens automaticamente',
        meta: { error: error?.message || String(error) },
      });
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
// @ts-nocheck
