import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  listarProdutos,
  obterEstoqueProduto,
  obterProduto,
  TinyEstoqueProduto,
  TinyProdutoDetalhado,
  TinyListarProdutosResponse,
  TinyApiError,
} from '@/lib/tinyApi';
import { getTinyAccessToken, upsertProduto } from '@/src/repositories/tinyProdutosRepository';
import type { Database } from '@/src/types/db-public';

type LogFn = (msg: string, meta?: Record<string, unknown>) => void;

export type SyncProdutosOptions = {
  limit?: number;
  enrichEstoque?: boolean;
  modoCron?: boolean;
  onLog?: LogFn;
};

export type SyncProdutosResult = {
  totalSincronizados: number;
  totalNovos: number;
  totalAtualizados: number;
  stats: SyncStats;
};

type SyncStats = {
  totalRequests: number;
  total429: number;
  backoffMs: number;
  maxBackoffMs: number;
  windowUsagePct: number;
  batchUsado: number;
  workersUsados: number;
  enrichAtivo: boolean;
};

// Rate limiter simples com janela deslizante
class RateLimiter {
  private windowMs = 60_000;
  private maxRequests: number;
  private hits: number[] = [];

  constructor(maxPerMinute: number) {
    this.maxRequests = maxPerMinute;
  }

  async schedule() {
    // limpa hits antigos
    const now = Date.now();
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    while (this.hits.length >= this.maxRequests) {
      const oldest = this.hits[0];
      const waitFor = Math.max(5, this.windowMs - (now - oldest));
      await delay(waitFor);
      const n = Date.now();
      this.hits = this.hits.filter((t) => n - t < this.windowMs);
    }
    this.hits.push(Date.now());
    return this.usagePct();
  }

  usagePct() {
    const now = Date.now();
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    return (this.hits.length / this.maxRequests) * 100;
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Wrapper de requisições para aplicar rate limit + backoff 429
async function tinyRequest<T>({
  fn,
  limiter,
  stats,
  log,
}: {
  fn: () => Promise<T>;
  limiter: RateLimiter;
  stats: SyncStats;
  log: LogFn;
}): Promise<T> {
  let attempt = 0;
  while (true) {
    const usage = await limiter.schedule();
    stats.windowUsagePct = Math.max(stats.windowUsagePct, usage);
    try {
      stats.totalRequests += 1;
      return await fn();
    } catch (err: any) {
      if (err instanceof TinyApiError && (err.status === 429 || /limite/i.test(err.body))) {
        stats.total429 += 1;
        attempt += 1;
        const backoff = Math.min(1000 * 2 ** (attempt - 1), 32_000);
        stats.backoffMs += backoff;
        stats.maxBackoffMs = Math.max(stats.maxBackoffMs, backoff);
        log(`429 recebido. Backoff ${backoff}ms (tentativa ${attempt})`);
        await delay(backoff);
        continue;
      }
      throw err;
    }
  }
}

function buildStats(): SyncStats {
  return {
    totalRequests: 0,
    total429: 0,
    backoffMs: 0,
    maxBackoffMs: 0,
    windowUsagePct: 0,
    batchUsado: 0,
    workersUsados: 0,
    enrichAtivo: false,
  };
}

function detectPressao(stats: SyncStats, usagePct: number) {
  return stats.total429 > 0 || usagePct > 80 || stats.backoffMs > 0;
}

export async function syncProdutosFromTiny(
  options: SyncProdutosOptions = {}
): Promise<
  SyncProdutosResult & { ok: true; mode: 'manual' | 'cron'; timedOut: boolean; totalRequests: number; total429: number; windowUsagePct: number; batchUsado: number; workersUsados: number; enrichAtivo: boolean; }
  | { ok: false; mode: 'manual' | 'cron'; timedOut: boolean; reason: string; errorMessage?: string; totalRequests?: number; total429?: number; windowUsagePct?: number; batchUsado?: number; workersUsados?: number; enrichAtivo?: boolean; }
> {
  const log: LogFn = options.onLog || ((msg, meta) => console.log(`[Sync Produtos] ${msg}`, meta ?? ''));

  // Config base
  let limit = options.limit ?? 100;
  let enrichEstoque = options.enrichEstoque ?? true;
  let workers = 4;
  const mode = options.modoCron ? 'cron' : 'manual';
  let timedOut = false;
  const TIMEBOX_MS = 7000;
  const start = Date.now();

  // Ajustes automáticos para cron
  if (options.modoCron) {
    limit = 8; // ultra conservador
    workers = 1;
    enrichEstoque = false;
  }

  const stats = buildStats();
  stats.batchUsado = limit;
  stats.workersUsados = workers;
  stats.enrichAtivo = enrichEstoque;

  const limiter = new RateLimiter(1300); // 1300 req/min (folga sobre 1400)
  let accessToken: string | null = null;
  try {
    accessToken = await getTinyAccessToken();
  } catch (err) {
    log('Erro ao obter accessToken', { error: String(err) });
    return { ok: false, mode, timedOut: false, reason: 'access-token', errorMessage: String(err), total429: stats.total429, totalRequests: stats.totalRequests, windowUsagePct: stats.windowUsagePct, batchUsado: stats.batchUsado, workersUsados: stats.workersUsados, enrichAtivo: !!enrichEstoque };
  }

  let offset = 0;
  let hasMore = true;
  let totalSincronizados = 0;
  let totalNovos = 0;
  let totalAtualizados = 0;

  // Cache simples para If-Modified-Since (usando dataAlteracao da listagem)
  const lastModifiedMap = new Map<number, string>();

  // Função para processar uma página de produtos com paralelismo controlado
  async function processItens(itens: TinyListarProdutosResponse['itens']) {
    const queue = [...itens];
    const results: Promise<void>[] = [];
    let currentWorkers = workers;

    const runWorker = async () => {
      while (queue.length) {
        // Timebox: interrompe processamento se passar do tempo
        const elapsed = Date.now() - start;
        if (elapsed > TIMEBOX_MS) {
          timedOut = true;
          break;
        }
        const produto = queue.shift();
        if (!produto) break;
        const produtoId = produto.id;
        const headers: Record<string, string> = {};
        if (produto?.dataAlteracao) {
          headers['If-Modified-Since'] = produto.dataAlteracao;
          lastModifiedMap.set(produtoId ?? -1, produto.dataAlteracao);
        } else if (produtoId && lastModifiedMap.has(produtoId)) {
          headers['If-Modified-Since'] = lastModifiedMap.get(produtoId)!;
        }

        try {
          const detalhe = await tinyRequest<TinyProdutoDetalhado>({
            fn: () =>
              obterProduto(accessToken!, produto.id ?? 0, {
                headers,
                allowNotModified: true,
              }),
            limiter,
            stats,
            log,
          });

          let estoqueDetalhado: TinyEstoqueProduto | null = null;
          if (enrichEstoque) {
            try {
              estoqueDetalhado = await tinyRequest<TinyEstoqueProduto>({
                fn: () =>
                  obterEstoqueProduto(accessToken!, produto.id ?? 0, {
                    headers,
                    allowNotModified: true,
                  }),
                limiter,
                stats,
                log,
              });
            } catch (err) {
              log(`Erro ao buscar estoque do produto ${produto.id}`, { error: String(err) });
            }
          }

          // Se notModified, não fazer upsert (economia)
          if ((detalhe as any)?.notModified && (!estoqueDetalhado || (estoqueDetalhado as any)?.notModified)) {
            continue;
          }

          // Buscar o registro atual para merge se necessário
          let registroAtual: any = null;
          try {
            const { data: atual, error: errAtual } = await supabaseAdmin
              .from('tiny_produtos')
              .select('*')
              .eq('id_produto_tiny', produto.id)
              .maybeSingle();
            if (!errAtual && atual) registroAtual = atual;
          } catch {}

          // Preferir campos do detalhado, depois do produto, depois manter o atual
          const detalheEstoque = (detalhe as any)?.estoque || {};
          const detalheDimensoes = (detalhe as any)?.dimensoes || {};
          const detalhePrecos = (detalhe as any)?.precos || {};
          const produtoData: any = {
            id_produto_tiny: produto.id,
            codigo: (produto as any).sku || (produto as any).codigo || registroAtual?.codigo || null,
            nome: (detalhe as any)?.nome || (produto as any).descricao || (produto as any).nome || registroAtual?.nome || '',
            unidade: (detalhe as any)?.unidade || (produto as any).unidade || registroAtual?.unidade || null,
            preco: detalhePrecos?.preco ?? (produto as any).precos?.preco ?? registroAtual?.preco ?? null,
            preco_promocional: detalhePrecos?.precoPromocional ?? (produto as any).precos?.precoPromocional ?? registroAtual?.preco_promocional ?? null,
            situacao: (detalhe as any)?.situacao || (produto as any).situacao || registroAtual?.situacao || null,
            tipo: (detalhe as any)?.tipo || (produto as any).tipo || registroAtual?.tipo || null,
            gtin: (detalhe as any)?.gtin || (produto as any).gtin || registroAtual?.gtin || null,
            imagem_url: (detalhe as any)?.anexos?.find?.((a: any) => a.url)?.url || registroAtual?.imagem_url || null,
            saldo: detalheEstoque?.saldo ?? estoqueDetalhado?.saldo ?? registroAtual?.saldo ?? null,
            reservado: detalheEstoque?.reservado ?? estoqueDetalhado?.reservado ?? registroAtual?.reservado ?? null,
            disponivel: detalheEstoque?.disponivel ?? estoqueDetalhado?.disponivel ?? registroAtual?.disponivel ?? null,
            descricao: (detalhe as any)?.descricao || registroAtual?.descricao || null,
            ncm: (detalhe as any)?.ncm || registroAtual?.ncm || null,
            origem: (detalhe as any)?.origem || registroAtual?.origem || null,
            peso_liquido: detalheDimensoes?.pesoLiquido ?? registroAtual?.peso_liquido ?? null,
            peso_bruto: detalheDimensoes?.pesoBruto ?? registroAtual?.peso_bruto ?? null,
            data_criacao_tiny: (produto as any).dataCriacao || registroAtual?.data_criacao_tiny || null,
            data_atualizacao_tiny: (produto as any).dataAlteracao || registroAtual?.data_atualizacao_tiny || null,
            // Adicionais: marca, categoria, fornecedores, embalagem, etc.
            fornecedor_codigo: (detalhe as any)?.fornecedores?.[0]?.codigoProdutoNoFornecedor || registroAtual?.fornecedor_codigo || null,
            embalagem_qtd: (detalhe as any)?.embalagem?.quantidade ?? registroAtual?.embalagem_qtd ?? null,
            marca: (detalhe as any)?.marca || registroAtual?.marca || null,
            categoria: (detalhe as any)?.categoria || (detalhe as any)?.grupo || registroAtual?.categoria || null,
            // Se existir coluna para JSON completo, salvar
            ...(typeof registroAtual?.raw_payload !== 'undefined' && { raw_payload: detalhe }),
          };

          await upsertProduto(produtoData);
          totalSincronizados++;
        } catch (error) {
          log(`Erro ao processar produto ${produto.id}`, { error: String(error) });
          if (stats.total429 > 0) {
            // Pressão: reduzir workers para 1
            currentWorkers = 1;
          }
        }
      }
    };

    const workerCount = currentWorkers;
    for (let i = 0; i < workerCount; i++) {
      results.push(runWorker());
    }
    await Promise.all(results);
  }

  try {
    // Só processa UMA janela/página por chamada (manual ou cron)
    const usage = limiter.usagePct();
    const emPressao = detectPressao(stats, usage);
    if (emPressao) {
      // Reduz batch e paralelismo sob pressão
      if (limit > 25) limit = 25;
      else if (limit > 10) limit = 10;
      enrichEstoque = false;
      workers = Math.max(1, Math.floor(workers / 2));
      stats.batchUsado = limit;
      stats.workersUsados = workers;
      stats.enrichAtivo = enrichEstoque;
      log(`Pressão detectada. Ajustando: limit=${limit}, workers=${workers}, enrich=${enrichEstoque}`);
    }

    const page = await tinyRequest<TinyListarProdutosResponse>({
      fn: () => listarProdutos(accessToken!, { limit, offset, situacao: 'A' }),
      limiter,
      stats,
      log,
    });

    const itens = page.itens || [];
    if (itens.length > 0) {
      await processItens(itens);
    }
    // Não paginar além de 1 janela!
    // Se timebox estourar, interrompe processamento
    if (timedOut) {
      const meta = {
        totalRequests: stats.totalRequests,
        total429: stats.total429,
        backoffMs: stats.backoffMs,
        maxBackoffMs: stats.maxBackoffMs,
        windowUsagePct: stats.windowUsagePct,
        batchUsado: stats.batchUsado,
        workersUsados: stats.workersUsados,
        enrichAtivo: !!enrichEstoque,
      };
      log('Resumo da sync (timed out)', meta);
      try {
        const payload: Database['public']['Tables']['sync_logs']['Insert'] = {
          job_id: null,
          level: 'warn',
          message: 'sync_produtos_timeout',
          meta: { ...meta, mode, timedOut: true },
        };
        await supabaseAdmin.from('sync_logs').insert(payload as any);
      } catch (err) {
        log('Falha ao gravar log no Supabase', { error: String(err) });
      }
      return {
        ok: false,
        mode,
        timedOut: true,
        reason: 'timeout',
        errorMessage: 'Timebox de execução excedido',
        totalRequests: stats.totalRequests,
        total429: stats.total429,
        windowUsagePct: stats.windowUsagePct,
        batchUsado: stats.batchUsado,
        workersUsados: stats.workersUsados,
        enrichAtivo: !!enrichEstoque,
      };
    }
  } catch (err) {
    log('Erro inesperado durante sync', { error: String(err) });
    return {
      ok: false,
      mode,
      timedOut: false,
      reason: 'unexpected',
      errorMessage: String(err),
      totalRequests: stats.totalRequests,
      total429: stats.total429,
      windowUsagePct: stats.windowUsagePct,
      batchUsado: stats.batchUsado,
      workersUsados: stats.workersUsados,
      enrichAtivo: !!enrichEstoque,
    };
  }

  const meta = {
    totalRequests: stats.totalRequests,
    total429: stats.total429,
    backoffMs: stats.backoffMs,
    maxBackoffMs: stats.maxBackoffMs,
    windowUsagePct: stats.windowUsagePct,
    batchUsado: stats.batchUsado,
    workersUsados: stats.workersUsados,
    enrichAtivo: !!enrichEstoque,
    mode,
    timedOut,
  };

  log('Resumo da sync', meta);
  try {
    const payload: Database['public']['Tables']['sync_logs']['Insert'] = {
      job_id: null,
      level: stats.total429 > 0 ? 'warn' : 'info',
      message: 'sync_produtos',
      meta,
    };
    await supabaseAdmin.from('sync_logs').insert(payload as any);
  } catch (err) {
    log('Falha ao gravar log no Supabase', { error: String(err) });
  }

  return {
    ok: true,
    mode,
    timedOut,
    totalSincronizados,
    totalNovos,
    totalAtualizados,
    totalRequests: stats.totalRequests,
    total429: stats.total429,
    windowUsagePct: stats.windowUsagePct,
    batchUsado: stats.batchUsado,
    workersUsados: stats.workersUsados,
    enrichAtivo: !!enrichEstoque,
    stats,
  };
}
