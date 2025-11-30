import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import {
  listarProdutos,
  obterEstoqueProduto,
  obterProduto,
  TinyEstoqueProduto,
  TinyProdutoDetalhado,
  TinyListarProdutosResponse,
  TinyApiError,
} from '@/lib/tinyApi';
import {
  getProdutosSyncCursor,
  upsertProdutosSyncCursor,
  type ProdutosSyncCursorRow,
} from '@/src/repositories/produtosCursorRepository';
import { upsertProduto, upsertProdutosEstoque } from '@/src/repositories/tinyProdutosRepository';
import type { Database } from '@/src/types/db-public';

type LogFn = (msg: string, meta?: Record<string, unknown>) => void;

// Modos suportados pelo core: manual (UI/scripts), cron (incremental conservador) e backfill (janelas maiores).
export type SyncProdutosMode = 'manual' | 'cron' | 'backfill';

// Parâmetros principais consumidos pela sync – limites, modo, cursor e ajustes operacionais vindos da UI/cron.
export type SyncProdutosOptions = {
  limit?: number;
  enrichEstoque?: boolean;
  modoCron?: boolean;
  mode?: SyncProdutosMode;
  updatedSince?: string | null;
  workers?: number;
  offset?: number;
  maxPages?: number;
  situacao?: 'A' | 'I' | 'E' | 'all';
  onLog?: LogFn;
  estoqueOnly?: boolean;
  cursorKey?: string | null;
  modeLabel?: string | null;
};

// Payload rico que retornamos para APIs/UI: totais sincronizados, cursor aplicado e telemetria de execução.
export type SyncProdutosResult = {
  totalSincronizados: number;
  totalNovos: number;
  totalAtualizados: number;
  updatedSince: string | null;
  latestDataAlteracao: string | null;
  pagesProcessed: number;
  offsetStart: number;
  offsetEnd: number;
  stats: SyncStats;
  modeLabel?: string | null;
  cursorKey?: string | null;
  cursorInitialLatest?: string | null;
  cursorInitialUpdatedSince?: string | null;
  cursorAppliedUpdatedSince?: string | null;
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

const MODE_TIMEBOX: Record<SyncProdutosMode, number | null> = {
  manual: 90_000,
  cron: 10_000,
  backfill: 240_000,
};

const MAX_TOKEN_REFRESH_RETRIES = 2;

const formatError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch (err) {
    return String(error);
  }
};

const hasTimezoneInfo = (value: string) => /[zZ]|[+-]\d\d(?::?\d\d)?$/.test(value);

function parseCursorDate(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const iso = hasTimezoneInfo(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function cursorValueToTinyTimestamp(value?: string | null) {
  const parsed = parseCursorDate(value);
  return parsed ? formatTinyTimestamp(parsed) : null;
}

const sanitizeCursorKey = (value?: string | null) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

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

function formatTinyTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

async function inferUpdatedSince(mode: SyncProdutosMode, explicit?: string | null) {
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }

  if (mode !== 'cron') return null;

  const { data } = await supabaseAdmin
    .from('tiny_produtos')
    .select('data_atualizacao_tiny')
    .not('data_atualizacao_tiny', 'is', null)
    .order('data_atualizacao_tiny', { ascending: false })
    .limit(1);

  const iso = (data as { data_atualizacao_tiny: string | null }[] | null)?.[0]?.data_atualizacao_tiny;
  if (iso) {
    const parsed = new Date(iso as string);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setMinutes(parsed.getMinutes() - 5);
      return formatTinyTimestamp(parsed);
    }
  }

  const fallback = new Date();
  fallback.setDate(fallback.getDate() - 2);
  return formatTinyTimestamp(fallback);
}

function detectPressao(stats: SyncStats, usagePct: number) {
  return stats.total429 > 0 || usagePct > 80 || stats.backoffMs > 0;
}

export async function syncProdutosFromTiny(
  options: SyncProdutosOptions = {}
): Promise<
  SyncProdutosResult & { ok: true; mode: SyncProdutosMode; timedOut: boolean; totalRequests: number; total429: number; windowUsagePct: number; batchUsado: number; workersUsados: number; enrichAtivo: boolean; }
  | {
      ok: false;
      mode: SyncProdutosMode;
      modeLabel?: string | null;
      timedOut: boolean;
      reason: string;
      errorMessage?: string;
      totalSincronizados?: number;
      totalNovos?: number;
      totalAtualizados?: number;
      totalRequests?: number;
      total429?: number;
      windowUsagePct?: number;
      batchUsado?: number;
      workersUsados?: number;
      enrichAtivo?: boolean;
      updatedSince?: string | null;
      latestDataAlteracao?: string | null;
      pagesProcessed?: number;
      cursorKey?: string | null;
    }
> {
  const mode: SyncProdutosMode = options.mode ?? (options.modoCron ? 'cron' : 'manual');
  const resolvedModeLabelRaw = typeof options.modeLabel === 'string' ? options.modeLabel.trim() : '';
  const modeLabel = resolvedModeLabelRaw
    ? resolvedModeLabelRaw
    : mode === 'cron' && options.estoqueOnly
      ? 'cron_estoque'
      : mode;
  const log: LogFn = options.onLog || ((msg, meta) => console.warn(`[Sync Produtos][${modeLabel}] ${msg}`, meta ?? ''));

  // Config base
  let limit = Math.max(1, options.limit ?? 100);
  const estoqueOnly = !!options.estoqueOnly;
  const explicitEnrich = typeof options.enrichEstoque === 'boolean' ? options.enrichEstoque : undefined;
  let enrichEstoque =
    typeof options.enrichEstoque === 'boolean'
      ? options.enrichEstoque
      : estoqueOnly
        ? true
        : false;
  console.log('[syncProdutosFromTiny] resolved options', {
    enrichEstoque,
    optionsEnrich: options.enrichEstoque,
    estoqueOnly,
    mode,
    modeLabel,
  });
  let workers = 4;
  if (typeof options.workers === 'number' && Number.isFinite(options.workers)) {
    workers = Math.max(1, Math.floor(options.workers));
  }
  let timedOut = false;
  const timeboxMs = MODE_TIMEBOX[mode];
  const hasTimebox = typeof timeboxMs === 'number' && timeboxMs > 0;
  const resolvedTimeboxMs = hasTimebox ? (timeboxMs as number) : null;
  const start = Date.now();

  // Ajustes automáticos para cron/backfill
  if (mode === 'cron') {
    limit = Math.min(limit, estoqueOnly ? 50 : 40);
    workers = 1;
  }

  const offsetStart = Math.max(0, options.offset ?? 0);
  const maxPages = mode === 'backfill' ? Math.max(1, options.maxPages ?? 5) : 1;
  const situacaoFiltro = options.situacao && options.situacao !== 'all' ? options.situacao : 'A';

  const stats = buildStats();
  stats.batchUsado = limit;
  stats.workersUsados = workers;
  stats.enrichAtivo = enrichEstoque;

  const cursorKey = sanitizeCursorKey(options.cursorKey);
  let cursorRow: ProdutosSyncCursorRow | null = null;
  let cursorDerivedUpdatedSince: string | null = null;

  if (cursorKey) {
    try {
      cursorRow = await getProdutosSyncCursor(cursorKey);
      cursorDerivedUpdatedSince = cursorValueToTinyTimestamp(
        cursorRow?.latest_data_alteracao ?? cursorRow?.updated_since ?? null
      );
    } catch (err) {
      log('Falha ao carregar cursor do catálogo', { cursorKey, error: formatError(err) });
    }
  }

  const cursorInitialUpdatedSince = cursorRow?.updated_since ?? null;
  const cursorInitialLatest = cursorRow?.latest_data_alteracao ?? null;

  const limiter = new RateLimiter(1300); // 1300 req/min (folga sobre 1400)
  let accessToken: string | null = null;
  const tokenRefreshState = { attempts: 0 };
  let totalSincronizados = 0;
  let totalNovos = 0;
  let totalAtualizados = 0;

  const renewAccessToken = async (context: string, countTowardsLimit: boolean) => {
    if (countTowardsLimit && tokenRefreshState.attempts >= MAX_TOKEN_REFRESH_RETRIES) {
      throw new Error('Limite de tentativas de renovação do token do Tiny atingido');
    }

    if (countTowardsLimit) {
      tokenRefreshState.attempts += 1;
    }

    log('Obtendo token do Tiny', { context, attempt: tokenRefreshState.attempts });
    accessToken = await getAccessTokenFromDbOrRefresh();
  };

  const callTinyWithAuthRetry = async <T>(executor: () => Promise<T>, context: string): Promise<T> => {
    while (true) {
      try {
        return await executor();
      } catch (error) {
        if (error instanceof TinyApiError && error.status === 401) {
          log('Tiny retornou 401, tentando renovar token', { context });
          try {
            await renewAccessToken(`401-${context}`, true);
          } catch (refreshErr) {
            log('Falha ao renovar token após 401', { context, error: formatError(refreshErr) });
            throw refreshErr;
          }
          continue;
        }
        throw error;
      }
    }
  };

  try {
    await renewAccessToken('initial', false);
  } catch (err) {
    log('Erro ao obter accessToken', { error: formatError(err) });
    return {
      ok: false,
      mode,
      modeLabel,
      timedOut: false,
      reason: 'access-token',
      errorMessage: formatError(err),
      totalSincronizados,
      totalNovos,
      totalAtualizados,
      total429: stats.total429,
      totalRequests: stats.totalRequests,
      windowUsagePct: stats.windowUsagePct,
      batchUsado: stats.batchUsado,
      workersUsados: stats.workersUsados,
      enrichAtivo: !!enrichEstoque,
      cursorKey,
    };
  }

  let pagesProcessed = 0;
  let currentOffset = offsetStart;
  const offsetSummary = { start: offsetStart, end: offsetStart };
  const explicitUpdatedSince = typeof options.updatedSince === 'string' && options.updatedSince.trim()
    ? options.updatedSince.trim()
    : null;
  let requestedUpdatedSince = explicitUpdatedSince ?? cursorDerivedUpdatedSince ?? null;
  if (!requestedUpdatedSince) {
    requestedUpdatedSince = await inferUpdatedSince(mode, null);
  }
  const cursorAppliedUpdatedSince = cursorKey ? (explicitUpdatedSince ?? cursorDerivedUpdatedSince ?? null) : null;
  let updatedSince: string | null = requestedUpdatedSince;

  // Função para processar uma página de produtos com paralelismo controlado
  let latestDataAlteracao: string | null = null;
  let cursorPersistedLatest: string | null = cursorInitialLatest;
  const updateLatestData = (value?: string | null) => {
    if (!value) return;
    if (!latestDataAlteracao || value > latestDataAlteracao) {
      latestDataAlteracao = value;
      updatedSince = value;
    }
  };

  async function processItens(itens: TinyListarProdutosResponse['itens']) {
    const queue = [...itens];
    const results: Promise<void>[] = [];
    let currentWorkers = workers;

    const runWorker = async () => {
      while (queue.length) {
        const produto = queue.shift();
        if (!produto) break;
        const produtoId = produto.id;
        const headers: Record<string, string> = {};

        try {
          const detalhe = await callTinyWithAuthRetry(
            () =>
              tinyRequest<TinyProdutoDetalhado>({
                fn: () =>
                  obterProduto(accessToken!, produto.id ?? 0, {
                    headers,
                    allowNotModified: true,
                  }),
                limiter,
                stats,
                log,
              }),
            `produto-${produtoId}-detalhe`
          );

          let estoqueDetalhado: TinyEstoqueProduto | null = null;
          if (enrichEstoque) {
            try {
              estoqueDetalhado = await callTinyWithAuthRetry(
                () =>
                  tinyRequest<TinyEstoqueProduto>({
                    fn: () =>
                      obterEstoqueProduto(accessToken!, produto.id ?? 0, {
                        headers,
                        allowNotModified: true,
                      }),
                    limiter,
                    stats,
                    log,
                  }),
                `produto-${produtoId}-estoque`
              );
            } catch (err) {
              log(`Erro ao buscar estoque do produto ${produto.id}`, { error: formatError(err) });
            }
          }

          // Se notModified, não fazer upsert (economia)
          if ((detalhe as any)?.notModified && (!estoqueDetalhado || (estoqueDetalhado as any)?.notModified)) {
            continue;
          }

          updateLatestData((produto as any)?.dataAlteracao ?? (detalhe as any)?.dataAlteracao ?? null);

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

          if (estoqueOnly) {
            await upsertProdutosEstoque([
              {
                id_produto_tiny: produtoData.id_produto_tiny,
                saldo: produtoData.saldo,
                reservado: produtoData.reservado,
                disponivel: produtoData.disponivel,
                preco: produtoData.preco,
                preco_promocional: produtoData.preco_promocional,
                data_atualizacao_tiny: produtoData.data_atualizacao_tiny,
              },
            ]);
          } else {
            await upsertProduto(produtoData);
          }
          totalSincronizados++;
          if (registroAtual) totalAtualizados++;
          else totalNovos++;
        } catch (error) {
          log(`Erro ao processar produto ${produto.id}`, { error: formatError(error) });
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
  const situacaoParam = options.situacao === 'all' ? undefined : situacaoFiltro;
  const maxPageAttempts = mode === 'backfill' ? maxPages : 1;

  const buildMeta = (extra?: Record<string, unknown>) => ({
    totalSincronizados,
    totalNovos,
    totalAtualizados,
    totalRequests: stats.totalRequests,
    total429: stats.total429,
    backoffMs: stats.backoffMs,
    maxBackoffMs: stats.maxBackoffMs,
    windowUsagePct: stats.windowUsagePct,
    batchUsado: stats.batchUsado,
    workersUsados: stats.workersUsados,
    enrichAtivo: !!enrichEstoque,
    mode,
    estoqueOnly,
    timedOut,
    updatedSince,
    latestDataAlteracao,
    pagesProcessed,
    offsetStart: offsetSummary.start,
    offsetEnd: offsetSummary.end,
    limitAtual: limit,
    workersAtuais: workers,
    requestedUpdatedSince,
    modeLabel,
    cursorKey,
    cursorInitialUpdatedSince,
    cursorInitialLatest,
    cursorDerivedUpdatedSince,
    cursorAppliedUpdatedSince,
    cursorPersistedLatest,
    ...(extra ?? {}),
  });

  const persistLog = async (level: 'info' | 'warn' | 'error', extra?: Record<string, unknown>) => {
    try {
      const payload: Database['public']['Tables']['sync_logs']['Insert'] = {
        job_id: null,
        level,
        message: 'sync_produtos',
        meta: buildMeta(extra),
      };
      await supabaseAdmin.from('sync_logs').insert(payload as any);
    } catch (err) {
      log('Falha ao gravar log no Supabase', { error: formatError(err) });
    }
  };

  const persistCursorState = async (reason: 'success' | 'timeout' | 'error') => {
    if (!cursorKey) return;
    const nextLatest = latestDataAlteracao ?? cursorPersistedLatest ?? null;
    const nextUpdatedSince = latestDataAlteracao ?? requestedUpdatedSince ?? cursorInitialUpdatedSince ?? cursorInitialLatest ?? null;
    if (!nextLatest && !nextUpdatedSince) return;
    try {
      const saved = await upsertProdutosSyncCursor(cursorKey, {
        updated_since: nextUpdatedSince,
        latest_data_alteracao: nextLatest,
      });
      cursorPersistedLatest = saved?.latest_data_alteracao ?? cursorPersistedLatest ?? null;
    } catch (err) {
      log('Falha ao atualizar cursor do catálogo', {
        cursorKey,
        reason,
        error: formatError(err),
      });
    }
  };

  const emitTimeout = async () => {
    const meta = buildMeta({ reason: 'timeout' });
    log('Resumo da sync (timeout)', meta);
    await persistLog('warn', { reason: 'timeout', errorMessage: 'Timebox de execução excedido' });
    await persistCursorState('timeout');
    return {
      ok: false as const,
      mode,
      modeLabel,
      timedOut: true as const,
      reason: 'timeout' as const,
      errorMessage: 'Timebox de execução excedido',
      totalSincronizados,
      totalNovos,
      totalAtualizados,
      totalRequests: stats.totalRequests,
      total429: stats.total429,
      windowUsagePct: stats.windowUsagePct,
      batchUsado: stats.batchUsado,
      workersUsados: stats.workersUsados,
      enrichAtivo: !!enrichEstoque,
      updatedSince,
      latestDataAlteracao,
      pagesProcessed,
      cursorKey,
    } as const;
  };

  const emitUnexpected = async (error: unknown) => {
    const description = formatError(error);
    const tinyMeta =
      error instanceof TinyApiError
        ? { tinyStatus: error.status, tinyBody: error.body }
        : {};
    console.error('[syncProdutosFromTiny] erro inesperado', { error: description, ...tinyMeta });
    log('Erro inesperado durante sync', { error: description, ...tinyMeta });
    await persistLog('error', { reason: 'unexpected', errorMessage: description, ...tinyMeta });
    await persistCursorState('error');
    return {
      ok: false as const,
      mode,
      modeLabel,
      timedOut: false,
      reason: 'unexpected' as const,
      errorMessage: description,
      totalSincronizados,
      totalNovos,
      totalAtualizados,
      totalRequests: stats.totalRequests,
      total429: stats.total429,
      windowUsagePct: stats.windowUsagePct,
      batchUsado: stats.batchUsado,
      workersUsados: stats.workersUsados,
      enrichAtivo: !!enrichEstoque,
      updatedSince,
      latestDataAlteracao,
      pagesProcessed,
      cursorKey,
    } as const;
  };

  try {
    while (!timedOut && pagesProcessed < maxPageAttempts) {
      const usage = limiter.usagePct();
      if (detectPressao(stats, usage)) {
        if (limit > 50) limit = 50;
        else if (limit > 25) limit = 25;
        else if (limit > 10) limit = 10;
        // Só desligar enrich se NÃO veio explicitamente true
        if (explicitEnrich !== true) {
          enrichEstoque = false;
        }
        workers = Math.max(1, Math.floor(workers / 2));
        stats.batchUsado = limit;
        stats.workersUsados = workers;
        stats.enrichAtivo = enrichEstoque;
        log(`Pressão detectada. Ajustando: limit=${limit}, workers=${workers}, enrich=${enrichEstoque}`);
      }

      const offsetForPage = currentOffset;
      offsetSummary.end = offsetForPage;
      const limitForPage = limit;
      stats.batchUsado = limitForPage;

      const page = await callTinyWithAuthRetry(
        () =>
          tinyRequest<TinyListarProdutosResponse>({
            fn: () =>
              listarProdutos(accessToken!, {
                limit: limitForPage,
                offset: offsetForPage,
                situacao: situacaoParam,
                dataAlteracao: requestedUpdatedSince ?? undefined,
              }),
            limiter,
            stats,
            log,
          }),
        'listar-produtos'
      );

      const itens = page.itens || [];
      if (itens.length > 0) {
        await processItens(itens);
      }

      pagesProcessed += 1;

      if (hasTimebox && resolvedTimeboxMs && Date.now() - start > resolvedTimeboxMs) {
        timedOut = true;
        return emitTimeout();
      }

      const paginacao = page.paginacao;
      const reachedEnd = paginacao ? paginacao.pagina >= paginacao.paginas : itens.length < limitForPage;
      currentOffset += limitForPage;

      if (mode !== 'backfill' || pagesProcessed >= maxPages || reachedEnd) {
        break;
      }
    }
  } catch (error) {
    return emitUnexpected(error);
  }

  const meta = buildMeta();
  log('Resumo da sync', meta);
  await persistLog(stats.total429 > 0 ? 'warn' : 'info', { reason: 'completed' });
  await persistCursorState('success');

  return {
    ok: true as const,
    mode,
    modeLabel,
    timedOut,
    totalSincronizados,
    totalNovos,
    totalAtualizados,
    totalRequests: stats.totalRequests,
    total429: stats.total429,
    windowUsagePct: stats.windowUsagePct,
    batchUsado: stats.batchUsado,
    workersUsados: stats.workersUsados,
    enrichAtivo: enrichEstoque,
    updatedSince,
    latestDataAlteracao,
    pagesProcessed,
    offsetStart: offsetSummary.start,
    offsetEnd: offsetSummary.end,
    cursorKey,
    cursorInitialLatest,
    cursorInitialUpdatedSince,
    cursorAppliedUpdatedSince,
    stats: {
      ...stats,
      enrichAtivo: enrichEstoque,
    },
  };
}
