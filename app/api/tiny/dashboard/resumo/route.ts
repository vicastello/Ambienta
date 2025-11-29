// app/api/tiny/dashboard/resumo/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { getErrorMessage } from '@/lib/errors';
import {
  descricaoSituacao,
  extrairDataISO,
  normalizarCanalTiny,
  parseValorTiny,
  TODAS_SITUACOES,
  extractCidadeUfFromRaw,
} from '@/lib/tinyMapping';
import type { Json, TinyOrdersRow, TinyPedidoItensRow, TinyProdutosRow } from '@/src/types/db-public';

type DiaResumo = {
  data: string; // yyyy-mm-dd
  quantidade: number;
  totalDia: number;
};

type SituacaoResumo = {
  situacao: number;
  descricao: string;
  quantidade: number;
};

type PeriodoResumo = {
  dataInicial: string;
  dataFinal: string;
  dias: number;
  totalPedidos: number;
  totalValor: number;
  totalValorLiquido: number; // sem frete
  totalFreteTotal: number; // total de frete
  ticketMedio: number;
  vendasPorDia: DiaResumo[];
  pedidosPorSituacao: SituacaoResumo[];
  totalProdutosVendidos: number;
  percentualCancelados: number;
  topProdutos: ProdutoResumo[];
};

type CanalResumo = {
  canal: string;
  totalValor: number;
  totalPedidos: number;
};

type VendasUF = {
  uf: string; // ex: 'SP'
  totalValor: number;
  totalPedidos: number;
};

type VendasCidade = {
  cidade: string; // nome da cidade
  uf: string | null; // UF se disponível
  totalValor: number;
  totalPedidos: number;
};

type ProdutoResumo = {
  produtoId: number | null;
  sku?: string | null;
  descricao: string;
  quantidade: number;
  receita: number;
  imagemUrl?: string | null;
  saldo?: number | null;
  reservado?: number | null;
  disponivel?: number | null;
};

type TinyPedidoItemWithProduto = Pick<
  TinyPedidoItensRow,
  | 'id_pedido'
  | 'id_produto_tiny'
  | 'codigo_produto'
  | 'nome_produto'
  | 'quantidade'
  | 'valor_unitario'
  | 'valor_total'
  | 'info_adicional'
> & {
  valorUnitario?: number | null;
  valorTotal?: number | null;
  valor?: number | null;
  tiny_produtos?: Pick<TinyProdutosRow, 'nome' | 'codigo' | 'imagem_url'> | null;
};

type PedidoItensMap = Map<number, TinyPedidoItemWithProduto[]>;

type OrderSummaryRow = Pick<
  TinyOrdersRow,
  'id' | 'tiny_id' | 'data_criacao' | 'valor' | 'valor_frete' | 'situacao' | 'canal' | 'raw' | 'inserted_at'
>;

type TinyPedidoRaw = Record<string, unknown> & {
  itens?: unknown;
  itensPedido?: unknown;
  cliente?: Record<string, unknown>;
};

type TinyRawItem = Record<string, unknown> & {
  quantidade?: unknown;
  valorUnitario?: unknown;
  valor_unitario?: unknown;
  valor?: unknown;
  valor_total?: unknown;
  valorTotal?: unknown;
  produto?: Record<string, unknown> | null;
};

type TinyOrderRawPayload = Record<string, unknown> & {
  valorTotalPedido?: string | number | null;
  valor?: string | number | null;
  valorFrete?: string | number | null;
  valorTotalProdutos?: string | number | null;
  itens?: unknown;
  pedido?: TinyPedidoRaw;
  cliente?: Record<string, unknown> & {
    endereco?: Record<string, unknown>;
    enderecoEntrega?: Record<string, unknown>;
    uf?: string | null;
    estado?: string | null;
    estadoUF?: string | null;
    ufCliente?: string | null;
    cidade?: string | null;
    municipio?: string | null;
  };
  enderecoEntrega?: Record<string, unknown>;
  entrega?: Record<string, unknown> & { endereco?: Record<string, unknown> };
  destinatario?: Record<string, unknown> & { endereco?: Record<string, unknown> };
  transportador?: Record<string, unknown> & { valorFrete?: string | number | null; valor_frete?: string | number | null };
};

type DashboardResposta = {
  periodoAtual: PeriodoResumo;
  periodoAnterior: PeriodoResumo;
  periodoAnteriorCards: PeriodoResumo;
  canais: CanalResumo[];
  canaisDisponiveis: string[];
  situacoesDisponiveis: Array<{ codigo: number; descricao: string }>;
  mapaVendasUF: VendasUF[];
  mapaVendasCidade: VendasCidade[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SUPABASE_PAGE_SIZE = 250;
const SUPABASE_MAX_ROWS = 10000;
const SUPABASE_MAX_RETRIES = 3;
const NETWORKISH_ERROR = /(fetch failed|Failed to fetch|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network request failed)/i;
const CANCELAMENTO_SITUACOES = new Set([8, 9]);
const DEFAULT_REPORT_TIMEZONE = 'America/Sao_Paulo';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asTinyOrderRaw = (value: Json | null): TinyOrderRawPayload | null =>
  isRecord(value) ? (value as TinyOrderRawPayload) : null;

const asTinyItem = (value: unknown): TinyRawItem | null =>
  isRecord(value) ? (value as TinyRawItem) : null;

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace?.(',', '.') ?? value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

const toParseableNumber = (value: unknown): string | number | null =>
  typeof value === 'string' || typeof value === 'number' ? value : null;

function extrairItens(raw: Json | null): TinyRawItem[] {
  const payload = asTinyOrderRaw(raw);
  if (!payload) return [];

  const pedido = payload.pedido as TinyPedidoRaw | undefined;
  const fontes = [payload.itens, pedido?.itens, pedido?.itensPedido];

  for (const fonte of fontes) {
    if (!Array.isArray(fonte)) continue;
    const itens: TinyRawItem[] = [];
    for (const item of fonte) {
      const parsed = asTinyItem(item);
      if (parsed) itens.push(parsed);
    }
    if (itens.length) return itens;
  }

  return [];
}

function registrarProduto(map: Map<string, ProdutoResumo>, item: TinyRawItem | null) {
  if (!item) return;
  const produtoRaw = isRecord(item.produto) ? item.produto : {};
  const produtoId = typeof produtoRaw.id === 'number' ? produtoRaw.id : null;
  const descricaoBase =
    (typeof produtoRaw.descricao === 'string' && produtoRaw.descricao.trim()) ||
    (typeof produtoRaw.nome === 'string' && produtoRaw.nome.trim()) ||
    'Produto sem nome';
  const skuCandidate =
    (typeof produtoRaw.sku === 'string' && produtoRaw.sku) ||
    (typeof produtoRaw.codigo === 'string' && produtoRaw.codigo) ||
    null;
  const key = produtoId ? `id:${produtoId}` : `${descricaoBase}-${skuCandidate ?? ''}`;
  const quantidade = toNumber(item.quantidade);
  const valorUnitario = parseValorTiny(
    toParseableNumber(item.valorUnitario ?? item.valor_unitario ?? item.valor)
  );
  const receita =
    parseValorTiny(toParseableNumber(item.valor_total ?? item.valorTotal)) ||
    quantidade * valorUnitario;

  const imagemPrincipal = produtoRaw.imagemPrincipal;
  let imagemUrl: string | null = null;
  if (isRecord(imagemPrincipal)) {
    const urlValue = imagemPrincipal.url;
    imagemUrl = typeof urlValue === 'string' ? urlValue : null;
  } else if (typeof imagemPrincipal === 'string') {
    imagemUrl = imagemPrincipal;
  }
  if (!imagemUrl && typeof produtoRaw.imagem === 'string') imagemUrl = produtoRaw.imagem;
  if (!imagemUrl && typeof produtoRaw.foto === 'string') imagemUrl = produtoRaw.foto;
  if (!imagemUrl && typeof produtoRaw.imagem_url === 'string') imagemUrl = produtoRaw.imagem_url;

  const atual = map.get(key) ?? {
    produtoId,
    sku: skuCandidate ?? undefined,
    descricao: descricaoBase,
    quantidade: 0,
    receita: 0,
    imagemUrl: imagemUrl ?? undefined,
    saldo: undefined,
    reservado: undefined,
    disponivel: undefined,
  };

  atual.quantidade += quantidade;
  atual.receita += receita;
  if (!atual.imagemUrl && imagemUrl) {
    atual.imagemUrl = imagemUrl;
  }

  map.set(key, atual);
}

function registrarProdutoPersistido(
  map: Map<string, ProdutoResumo>,
  item: TinyPedidoItemWithProduto | null
) {
  if (!item) return;
  const quantidade = toNumber(item.quantidade);
  if (quantidade <= 0) return;
  const valorUnitario = parseValorTiny(
    toParseableNumber(item.valor_unitario ?? item.valorUnitario ?? item.valor)
  );
  const receita =
    parseValorTiny(toParseableNumber(item.valor_total ?? item.valorTotal)) ||
    quantidade * valorUnitario;

  const descricao =
    (typeof item.nome_produto === 'string' && item.nome_produto) ||
    item.tiny_produtos?.nome ||
    'Sem descrição';
  const sku = item.codigo_produto ?? item.tiny_produtos?.codigo ?? null;
  const imagemUrl = item.tiny_produtos?.imagem_url ?? null;
  const produtoId = item.id_produto_tiny;
  const key = produtoId ? `id:${produtoId}` : `${descricao}-${sku ?? ''}`;

  const atual = map.get(key) ?? {
    produtoId: produtoId,
    sku: sku ?? undefined,
    descricao,
    quantidade: 0,
    receita: 0,
    imagemUrl: imagemUrl ?? undefined,
    saldo: undefined,
    reservado: undefined,
    disponivel: undefined,
  };

  atual.quantidade += quantidade;
  atual.receita += receita;
  if (!atual.imagemUrl && imagemUrl) {
    atual.imagemUrl = imagemUrl;
  }

  map.set(key, atual);
}

async function carregarItensPorPedido(orderIds: number[]): Promise<PedidoItensMap> {
  const mapa: PedidoItensMap = new Map();
  if (!orderIds.length) return mapa;

  const CHUNK_SIZE = 200;
  for (let offset = 0; offset < orderIds.length; offset += CHUNK_SIZE) {
    const chunk = orderIds.slice(offset, offset + CHUNK_SIZE);
    const { data, error } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select(`
        id_pedido,
        id_produto_tiny,
        codigo_produto,
        nome_produto,
        quantidade,
        valor_unitario,
        valor_total,
        info_adicional,
        tiny_produtos (
          nome,
          codigo,
          imagem_url
        )
      `)
      .in('id_pedido', chunk);

    if (error) {
      throw error;
    }

    const typedRows = ((data ?? []) as unknown) as TinyPedidoItemWithProduto[];
    for (const row of typedRows) {
      const pedidoId = row.id_pedido;
      if (typeof pedidoId !== 'number') continue;
      const lista = mapa.get(pedidoId) ?? [];
      lista.push(row);
      mapa.set(pedidoId, lista);
    }
  }

  return mapa;
}

function diffDias(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS);
}
function addDias(base: Date, dias: number): Date {
  return new Date(base.getTime() + dias * DAY_MS);
}

function todayInTimeZone(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

function minutesOfDayInTimeZone(dateInput: string | null | undefined, timeZone: string): number | null {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const formatted = formatter.format(date); // HH:MM
  const [hourStr, minuteStr] = formatted.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const max = 24 * 60;
  return Math.min(Math.max(Math.floor(value), 0), max);
}

// Extrai valores bruto/líquido/frete do JSON bruto do Tiny
// Usa valorTotalPedido (bruto), valorTotalProdutos (líquido), frete = diferença
function extrairValoresDoTiny(
  rawInput: Json | TinyOrderRawPayload | null,
  fallbacks?: { valorBruto?: number; valorFrete?: number }
): { bruto: number; liquido: number; frete: number } {
  const fallbackBruto = fallbacks?.valorBruto ?? 0;
  const fallbackFrete = fallbacks?.valorFrete ?? 0;

  if (!rawInput && !fallbackBruto && !fallbackFrete) {
    return { bruto: 0, liquido: 0, frete: 0 };
  }

  try {
    const raw = isRecord(rawInput) ? (rawInput as TinyOrderRawPayload) : null;
    const bruto = parseValorTiny(
      toParseableNumber(raw?.valorTotalPedido ?? raw?.valor ?? fallbackBruto)
    );

    let frete = 0;
    let liquido = 0;

    if (raw && raw.valorFrete !== undefined && raw.valorFrete !== null) {
      frete = parseValorTiny(toParseableNumber(raw.valorFrete));
      liquido = bruto > 0 ? Math.max(0, bruto - frete) : 0;
    } else if (raw && raw.valorTotalProdutos !== undefined && raw.valorTotalProdutos !== null) {
      liquido = parseValorTiny(toParseableNumber(raw.valorTotalProdutos));
      frete = bruto > 0 && liquido > 0 ? Math.max(0, bruto - liquido) : 0;
    } else if (fallbackFrete > 0) {
      frete = fallbackFrete;
      const brutoReferencia = bruto > 0 ? bruto : fallbackBruto;
      liquido = brutoReferencia > 0 ? Math.max(0, brutoReferencia - frete) : 0;
    } else {
      const brutoReferencia = bruto > 0 ? bruto : fallbackBruto;
      liquido = brutoReferencia > 0 ? brutoReferencia : 0;
      frete = 0;
    }

    return {
      bruto: bruto > 0 ? bruto : Math.max(0, fallbackBruto),
      liquido: liquido > 0 ? liquido : 0,
      frete: frete > 0 ? frete : 0,
    };
  } catch {
    return { bruto: Math.max(0, fallbackBruto), liquido: 0, frete: 0 };
  }
}

// Função legada mantida para compatibilidade
function extrairFrete(raw: Json | TinyOrderRawPayload | null): number {
  const { frete } = extrairValoresDoTiny(raw);
  return frete;
}

/**
 * Batch fetch frete from detailed endpoint (com timeout para não bloquear)
 * Atualiza raw JSON no banco com valorFrete
 * Agora é sincronous com timeout!
 */
/**
 * Batch fetch frete from detailed endpoint (com timeout para não bloquear)
 * Atualiza raw JSON no banco com valorFrete
 * Agora é sincronous com timeout!
 */
async function enrichOrdersWithFrete(
  accessToken: string,
  orderIds: number[],
  maxToFetch: number = 50
): Promise<void> {
  // TODO: Implement frete enrichment in separate sync job
  // For now, returning without doing anything to avoid blocking
  return;
}

export async function GET(req: NextRequest) {
  try {
    // Token
    let accessToken = req.cookies.get('tiny_access_token')?.value || null;
    if (!accessToken) {
      try { accessToken = await getAccessTokenFromDbOrRefresh(); } catch { accessToken = null; }
    }

    const { searchParams } = new URL(req.url);
    const dataInicialParam = searchParams.get('dataInicial');
    const dataFinalParam = searchParams.get('dataFinal');
    const diasParam = searchParams.get('dias');
    const canaisParam = searchParams.get('canais');
    const situacoesParam = searchParams.get('situacoes');
    const complementParam = searchParams.get('complement');
    const doComplement = complementParam === '1' || complementParam === 'true';
    const horaComparacaoParam = searchParams.get('horaComparacaoMinutos');
    const horaComparacaoVal = horaComparacaoParam ? Number(horaComparacaoParam) : null;
    const horaComparacaoMinutos = Number.isFinite(horaComparacaoVal)
      ? clampMinutes(horaComparacaoVal as number)
      : null;

    const hoje = new Date();
    const dataFinalDate = dataFinalParam ? new Date(`${dataFinalParam}T00:00:00`) : hoje;
    const dataInicialDate = dataInicialParam ? new Date(`${dataInicialParam}T00:00:00`) : addDias(dataFinalDate, -1 * ((diasParam ? Number(diasParam) : 30) - 1));

    const diasPeriodo = diffDias(dataInicialDate, dataFinalDate) >= 0 ? diffDias(dataInicialDate, dataFinalDate) + 1 : 1;
    
    // Período anterior: mês anterior completo
    // Ex: se período atual é 01/11 a 30/11 (nov), período anterior é 01/10 a 31/10 (out)
    // Se período atual é 01/12 a 25/12, período anterior é 01/11 a 30/11 (nov inteiro)
    const dataInicialAnteriorDate = new Date(dataInicialDate);
    dataInicialAnteriorDate.setMonth(dataInicialAnteriorDate.getMonth() - 1);
    dataInicialAnteriorDate.setDate(1); // Sempre primeiro dia do mês anterior
    
    const dataFinalAnteriorDate = new Date(dataInicialAnteriorDate);
    dataFinalAnteriorDate.setMonth(dataFinalAnteriorDate.getMonth() + 1); // Vai pro próximo mês
    dataFinalAnteriorDate.setDate(0); // Volta pro último dia do mês anterior

    // Strings apenas com data (yyyy-mm-dd) para queries
    const dataInicialStr = dataInicialDate.toISOString().slice(0, 10);
    const dataFinalStr = dataFinalDate.toISOString().slice(0, 10);
    const dataInicialAnteriorStr = dataInicialAnteriorDate.toISOString().slice(0, 10);
    const dataFinalAnteriorStr = dataFinalAnteriorDate.toISOString().slice(0, 10);
    const hojeTimezoneStr = todayInTimeZone(DEFAULT_REPORT_TIMEZONE);
    const isSingleDayFilter = dataInicialStr === dataFinalStr;
    const aplicarCorteHoraAnteriorCards =
      isSingleDayFilter && dataFinalStr === hojeTimezoneStr && horaComparacaoMinutos !== null;

    // Strings com timestamp para queries rangadas (início e fim do dia)
    const dataInicialISO = `${dataInicialStr}T00:00:00Z`;
    const dataFinalISO = `${dataFinalStr}T23:59:59Z`;
    const dataInicialAnteriorISO = `${dataInicialAnteriorStr}T00:00:00Z`;
    const dataFinalAnteriorISO = `${dataFinalAnteriorStr}T23:59:59Z`;

    const limiteInferiorStr = dataInicialAnteriorStr; // janela unificada p/ complemento

    const canaisFiltro = canaisParam ? canaisParam.split(',').filter(Boolean) : null;
    const situacoesFiltro = situacoesParam ? situacoesParam.split(',').map((s) => Number(s)).filter((n) => Number.isFinite(n)) : null;

    // =========================
    // 1) Tentar complementar do Tiny e salvar no banco (opcional via query)
    // =========================
    // DEPRECATED: Complement logic disabled
    // Data is now synced continuously via POST /api/tiny/pedidos
    // and enriched via background jobs
    // =========================

    if (false && doComplement) {
      // This block is disabled to avoid unnecessary API calls
      // All data synchronization now happens through:
      // 1. POST /api/tiny/pedidos - syncs list data with merge logic
      // 2. GET /api/tiny/sync/enrich-background - enriches with detailed data
    }

    // =========================
    // 2) Carregar do banco e agrupar métricas (DB-first)
    // =========================
    // Query período atual e anterior com paginação separada para evitar truncar na fronteira
    
    // Função helper para paginar uma query
    const fetchPageWithRetry = async (
      dataInicial: string,
      dataFinal: string,
      rangeStart: number,
      rangeEnd: number,
      attempt = 1
    ): Promise<OrderSummaryRow[]> => {
      const { data, error } = await supabaseAdmin
        .from('tiny_orders')
        .select('id, tiny_id, data_criacao, valor, valor_frete, situacao, canal, raw, inserted_at')
        .gte('data_criacao', dataInicial)
        .lte('data_criacao', dataFinal)
        .order('id', { ascending: true })
        .range(rangeStart, rangeEnd);

      if (error) {
        const message = error.message ?? '';
        const canRetry = attempt < SUPABASE_MAX_RETRIES && NETWORKISH_ERROR.test(message);
        if (canRetry) {
          console.warn(
            `[API] Supabase fetch falhou (tentativa ${attempt}) para range ${rangeStart}-${rangeEnd}: ${message}`
          );
          await sleep(250 * attempt);
          return fetchPageWithRetry(dataInicial, dataFinal, rangeStart, rangeEnd, attempt + 1);
        }
        throw error;
      }

      return (data ?? []) as OrderSummaryRow[];
    };

    const fetchAllOrdersForPeriod = async (dataInicial: string, dataFinal: string) => {
      const allOrdersForPeriod: OrderSummaryRow[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore && offset < SUPABASE_MAX_ROWS) {
        const rangeStart = offset;
        const rangeEnd = Math.min(rangeStart + SUPABASE_PAGE_SIZE - 1, SUPABASE_MAX_ROWS - 1);
        let pageOrders: OrderSummaryRow[] = [];

        try {
          pageOrders = await fetchPageWithRetry(dataInicial, dataFinal, rangeStart, rangeEnd);
        } catch (err) {
          console.error('[API] Supabase page fetch erro', {
            rangeStart,
            rangeEnd,
            message: err instanceof Error ? err.message : 'Erro desconhecido',
          });
          const message = err instanceof Error ? err.message : 'Erro desconhecido';
          throw new Error('Erro ao carregar pedidos do banco: ' + message);
        }

        if (!pageOrders.length) {
          hasMore = false;
        } else {
          allOrdersForPeriod.push(...pageOrders);
          offset += SUPABASE_PAGE_SIZE;
          if (pageOrders.length < SUPABASE_PAGE_SIZE) hasMore = false;
        }
      }

      return allOrdersForPeriod;
    };

    // Busca período anterior e período atual separadamente
    const ordersAnterior = await fetchAllOrdersForPeriod(dataInicialAnteriorISO, dataFinalAnteriorISO);
    const ordersAtual = await fetchAllOrdersForPeriod(dataInicialISO, dataFinalISO);

    const idsAnterior = ordersAnterior
      .map((p) => p.id)
      .filter((id): id is number => typeof id === 'number');
    const idsAtual = ordersAtual
      .map((p) => p.id)
      .filter((id): id is number => typeof id === 'number');
    const [itensPorPedidoAnterior, itensPorPedidoAtual] = await Promise.all([
      carregarItensPorPedido(idsAnterior),
      carregarItensPorPedido(idsAtual),
    ]);
    
    console.log(`[DEBUG] Período anterior (${dataInicialAnteriorStr} a ${dataFinalAnteriorStr}): ${ordersAnterior.length} pedidos`);
    console.log(`[DEBUG] Período atual (${dataInicialStr} a ${dataFinalStr}): ${ordersAtual.length} pedidos`);

    const mapaDiaAtual = new Map<string, { quantidade: number; totalDia: number }>();
    const mapaDiaAnterior = new Map<
      string,
      { quantidade: number; totalDia: number }
    >();

    const mapaSitAtual = new Map<number, number>();
    const mapaSitAnterior = new Map<number, number>();

    const mapaCanalAtual = new Map<string, { totalValor: number; totalPedidos: number }>();
    const mapaProdutoAtual = new Map<string, ProdutoResumo>();
    const mapaProdutoAnterior = new Map<string, ProdutoResumo>();

    // Mapas geográficos (período atual)
    const mapaUFAtual = new Map<string, { totalValor: number; totalPedidos: number }>();
    const mapaCidadeAtual = new Map<string, { uf: string | null; totalValor: number; totalPedidos: number }>();

    const canaisDisponiveisSet = new Set<string>();
    const situacoesDisponiveisSet = new Set<number>();

    let totalPedidosAtual = 0;
    let totalValorAtual = 0;      // valor bruto
    let totalValorLiquidoAtual = 0; // valor líquido (sem frete)
    let totalFreteAtual = 0;
    let totalProdutosAtual = 0;
    let totalPedidosAtualBaseCancel = 0;
    let canceladosAtualBase = 0;

    let totalPedidosAnterior = 0;
    let totalValorAnterior = 0;      // valor bruto
    let totalValorLiquidoAnterior = 0; // valor líquido (sem frete)
    let totalFreteAnterior = 0;
    let totalProdutosAnterior = 0;
    let totalPedidosAnteriorBaseCancel = 0;
    let canceladosAnteriorBase = 0;

    // Processa período anterior
    for (const p of ordersAnterior ?? []) {
      const data = p.data_criacao;
      if (!data) continue;

      const valorFallback = parseValorTiny(p.valor);
      const freteFallback = parseValorTiny(p.valor_frete);
      const { bruto, liquido, frete } = extrairValoresDoTiny(p.raw, {
        valorBruto: valorFallback,
        valorFrete: freteFallback,
      });
      const valor = bruto > 0 ? bruto : valorFallback;
      const situacao = typeof p.situacao === 'number' ? p.situacao : -1;
      const canal = normalizarCanalTiny(p.canal);

      // Registra canais e situações disponíveis
      canaisDisponiveisSet.add(canal);
      situacoesDisponiveisSet.add(situacao);

      const passaCanal =
        !canaisFiltro || canaisFiltro.length === 0
          ? true
          : canaisFiltro.includes(canal);

      const passaSituacao =
        !situacoesFiltro || situacoesFiltro.length === 0
          ? true
          : situacoesFiltro.includes(situacao);

      if (passaCanal) {
        totalPedidosAnteriorBaseCancel += 1;
        if (CANCELAMENTO_SITUACOES.has(situacao)) {
          canceladosAnteriorBase += 1;
        }
      }

      if (!passaCanal || !passaSituacao) continue;

      totalPedidosAnterior += 1;
      totalValorAnterior += valor;
      totalValorLiquidoAnterior += liquido;
      totalFreteAnterior += frete;

      const diaInfoAnt =
        mapaDiaAnterior.get(data) ?? { quantidade: 0, totalDia: 0 };
      diaInfoAnt.quantidade += 1;
      diaInfoAnt.totalDia += valor;
      mapaDiaAnterior.set(data, diaInfoAnt);

      const qtdSitAnt = mapaSitAnterior.get(situacao) ?? 0;
      mapaSitAnterior.set(situacao, qtdSitAnt + 1);

      // demais métricas seguem filtros aplicados

      const itensPersistidos = p.id ? itensPorPedidoAnterior.get(p.id) ?? [] : [];
      if (itensPersistidos.length) {
        for (const item of itensPersistidos) {
          const qtdProduto = toNumber(item?.quantidade);
          totalProdutosAnterior += qtdProduto;
          registrarProdutoPersistido(mapaProdutoAnterior, item);
        }
      } else {
        const itensAnterior = extrairItens(p.raw);
        if (itensAnterior.length) {
          for (const item of itensAnterior) {
            const qtdProduto = toNumber(item?.quantidade);
            totalProdutosAnterior += qtdProduto;
            registrarProduto(mapaProdutoAnterior, item);
          }
        }
      }
    }

    // Processa período atual
    for (const p of ordersAtual ?? []) {
      const data = p.data_criacao;
      if (!data) continue;

      const valorFallback = parseValorTiny(p.valor);
      const freteFallback = parseValorTiny(p.valor_frete);
      const { bruto, liquido, frete } = extrairValoresDoTiny(p.raw, {
        valorBruto: valorFallback,
        valorFrete: freteFallback,
      });
      const valor = bruto > 0 ? bruto : valorFallback;
      const situacao = typeof p.situacao === 'number' ? p.situacao : -1;
      const canal = normalizarCanalTiny(p.canal);

      // Registra canais e situações disponíveis
      canaisDisponiveisSet.add(canal);
      situacoesDisponiveisSet.add(situacao);

      const passaCanal =
        !canaisFiltro || canaisFiltro.length === 0
          ? true
          : canaisFiltro.includes(canal);

      const passaSituacao =
        !situacoesFiltro || situacoesFiltro.length === 0
          ? true
          : situacoesFiltro.includes(situacao);

      if (passaCanal) {
        totalPedidosAtualBaseCancel += 1;
        if (CANCELAMENTO_SITUACOES.has(situacao)) {
          canceladosAtualBase += 1;
        }
      }

      if (!passaCanal || !passaSituacao) continue;

      totalPedidosAtual += 1;
      totalValorAtual += valor;
      totalValorLiquidoAtual += liquido;
      totalFreteAtual += frete;

      const diaInfo =
        mapaDiaAtual.get(data) ?? { quantidade: 0, totalDia: 0 };
      diaInfo.quantidade += 1;
      diaInfo.totalDia += valor;
      mapaDiaAtual.set(data, diaInfo);

      const qtdSit = mapaSitAtual.get(situacao) ?? 0;
      mapaSitAtual.set(situacao, qtdSit + 1);

      const canalInfo =
        mapaCanalAtual.get(canal) ?? { totalValor: 0, totalPedidos: 0 };
      canalInfo.totalPedidos += 1;
      canalInfo.totalValor += valor;
      mapaCanalAtual.set(canal, canalInfo);

      // Agregação geográfica por UF e Cidade (melhor esforço a partir do raw)
      const rawPayload = asTinyOrderRaw(p.raw);
      if (rawPayload) {
        const { cidade, uf } = extractCidadeUfFromRaw(rawPayload);

        if (uf) {
          const infoUF = mapaUFAtual.get(uf) ?? { totalValor: 0, totalPedidos: 0 };
          infoUF.totalValor += valor;
          infoUF.totalPedidos += 1;
          mapaUFAtual.set(uf, infoUF);
        }

        if (cidade) {
          const keyCidade = `${cidade.toLowerCase()}|${uf ?? ''}`;
          const infoCid =
            mapaCidadeAtual.get(keyCidade) ?? {
              uf: uf ?? null,
              totalValor: 0,
              totalPedidos: 0,
            };
          infoCid.totalValor += valor;
          infoCid.totalPedidos += 1;
          mapaCidadeAtual.set(keyCidade, infoCid);
        }
      }

      // demais métricas seguem filtros aplicados

      const itensPersistidos = p.id ? itensPorPedidoAtual.get(p.id) ?? [] : [];
      if (itensPersistidos.length) {
        for (const item of itensPersistidos) {
          const qtdProduto = toNumber(item?.quantidade);
          totalProdutosAtual += qtdProduto;
          registrarProdutoPersistido(mapaProdutoAtual, item);
        }
      } else {
        const itensAtuais = extrairItens(p.raw);
        if (itensAtuais.length) {
          for (const item of itensAtuais) {
            const qtdProduto = toNumber(item?.quantidade);
            totalProdutosAtual += qtdProduto;
            registrarProduto(mapaProdutoAtual, item);
          }
        }
      }
    }

    const vendasPorDiaAtual: DiaResumo[] = Array.from(mapaDiaAtual.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([data, info]) => ({
        data,
        quantidade: info.quantidade,
        totalDia: info.totalDia,
      }));

    const vendasPorDiaAnterior: DiaResumo[] = Array.from(
      mapaDiaAnterior.entries()
    )
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([data, info]) => ({
        data,
        quantidade: info.quantidade,
        totalDia: info.totalDia,
      }));

    const pedidosPorSituacaoAtual: SituacaoResumo[] = Array.from(
      mapaSitAtual.entries()
    ).map(([situacao, quantidade]) => ({
      situacao,
      descricao: descricaoSituacao(situacao),
      quantidade,
    }));

    const pedidosPorSituacaoAnterior: SituacaoResumo[] = Array.from(
      mapaSitAnterior.entries()
    ).map(([situacao, quantidade]) => ({
      situacao,
      descricao: descricaoSituacao(situacao),
      quantidade,
    }));

    const canais: CanalResumo[] = Array.from(mapaCanalAtual.entries()).map(
      ([canal, info]) => ({
        canal,
        totalValor: info.totalValor,
        totalPedidos: info.totalPedidos,
      })
    );

    // Enriquecer top produtos com estoque da tiny_produtos (quando existir)
    const produtosParaEnriquecerIds = Array.from(mapaProdutoAtual.values())
      .map((p) => p.produtoId)
      .filter((id): id is number => typeof id === 'number');
    const produtosParaEnriquecerSkus = Array.from(mapaProdutoAtual.values())
      .map((p) => p.sku)
      .filter((sku): sku is string => !!sku);

    const estoqueLookup: Record<string, { saldo: number | null; reservado: number | null; disponivel: number | null }> = {};
    try {
      const query = supabaseAdmin
        .from('tiny_produtos')
        .select('id_produto_tiny,codigo,saldo,reservado,disponivel');

      if (produtosParaEnriquecerIds.length) {
        query.in('id_produto_tiny', produtosParaEnriquecerIds);
      } else if (produtosParaEnriquecerSkus.length) {
        query.in('codigo', produtosParaEnriquecerSkus);
      }

      const { data: produtosEstoque, error: estoqueErr } = await query;
      if (!estoqueErr && produtosEstoque) {
        for (const p of produtosEstoque) {
          const keyId = p.id_produto_tiny ? `id:${p.id_produto_tiny}` : null;
          const keySku = p.codigo ? `sku:${p.codigo}` : null;
          const payload = {
            saldo: p.saldo ?? null,
            reservado: p.reservado ?? null,
            disponivel: p.disponivel ?? null,
          };
          if (keyId) estoqueLookup[keyId] = payload;
          if (keySku) estoqueLookup[keySku] = payload;
        }
      }
    } catch (e) {
      console.warn('[Dashboard resumo] Falha ao carregar estoque para top produtos', e);
    }

    const enrichProdutos = (arr: ProdutoResumo[]) =>
      arr.map((prod) => {
        const keyId = prod.produtoId ? `id:${prod.produtoId}` : null;
        const keySku = prod.sku ? `sku:${prod.sku}` : null;
        const found =
          (keyId && estoqueLookup[keyId]) ||
          (keySku && estoqueLookup[keySku]) ||
          null;
        if (!found) return prod;
        return {
          ...prod,
          saldo: found.saldo,
          reservado: found.reservado,
          disponivel: found.disponivel,
        };
      });

    const periodoAtual: PeriodoResumo = {
      dataInicial: dataInicialStr,
      dataFinal: dataFinalStr,
      dias: diasPeriodo,
      totalPedidos: totalPedidosAtual,
      totalValor: totalValorAtual,
      totalValorLiquido: Math.max(0, totalValorAtual - totalFreteAtual),
      totalFreteTotal: totalFreteAtual,
      ticketMedio:
        totalPedidosAtual > 0 ? totalValorAtual / totalPedidosAtual : 0,
      vendasPorDia: vendasPorDiaAtual,
      pedidosPorSituacao: pedidosPorSituacaoAtual,
      totalProdutosVendidos: totalProdutosAtual,
      percentualCancelados:
        totalPedidosAtualBaseCancel > 0
          ? (canceladosAtualBase / totalPedidosAtualBaseCancel) * 100
          : 0,
      topProdutos: enrichProdutos(
        Array.from(mapaProdutoAtual.values())
          .sort((a, b) => b.quantidade - a.quantidade)
          .slice(0, 10)
      ),
    };

    const periodoAnterior: PeriodoResumo = {
      dataInicial: dataInicialAnteriorStr,
      dataFinal: dataFinalAnteriorStr,
      dias: diasPeriodo,
      totalPedidos: totalPedidosAnterior,
      totalValor: totalValorAnterior,
      totalValorLiquido: Math.max(0, totalValorAnterior - totalFreteAnterior),
      totalFreteTotal: totalFreteAnterior,
      ticketMedio:
        totalPedidosAnterior > 0
          ? totalValorAnterior / totalPedidosAnterior
          : 0,
      vendasPorDia: vendasPorDiaAnterior,
      pedidosPorSituacao: pedidosPorSituacaoAnterior,
      totalProdutosVendidos: totalProdutosAnterior,
      percentualCancelados:
        totalPedidosAnteriorBaseCancel > 0
          ? (canceladosAnteriorBase / totalPedidosAnteriorBaseCancel) * 100
          : 0,
      topProdutos: enrichProdutos(
        Array.from(mapaProdutoAnterior.values())
          .sort((a, b) => b.quantidade - a.quantidade)
          .slice(0, 10)
      ),
    };

    // Para os cards, calcular período anterior: mesmo dia/mês do mês anterior
    // Se período atual é 01/11 a 18/11 (18 dias), período anterior é 01/10 a 18/10 (18 dias)
    const dataInicialAnteriorCardsDate = new Date(dataInicialDate);
    const dataFinalAnteriorCardsDate = new Date(dataFinalDate);

    if (isSingleDayFilter) {
      // Para comparativos diários, usa o dia imediatamente anterior ao filtro atual
      dataInicialAnteriorCardsDate.setDate(dataInicialAnteriorCardsDate.getDate() - 1);
      dataFinalAnteriorCardsDate.setDate(dataFinalAnteriorCardsDate.getDate() - 1);
    } else {
      dataInicialAnteriorCardsDate.setMonth(dataInicialAnteriorCardsDate.getMonth() - 1);
      dataFinalAnteriorCardsDate.setMonth(dataFinalAnteriorCardsDate.getMonth() - 1);
    }

    const dataInicialAnteriorCardsStr = dataInicialAnteriorCardsDate.toISOString().slice(0, 10);
    const dataFinalAnteriorCardsStr = dataFinalAnteriorCardsDate.toISOString().slice(0, 10);

    // Strings com timestamp para cards (início e fim do dia)
    const dataInicialAnteriorCardsISO = `${dataInicialAnteriorCardsStr}T00:00:00Z`;
    const dataFinalAnteriorCardsISO = `${dataFinalAnteriorCardsStr}T23:59:59Z`;

    // Carregar dados para cards do período anterior (até hoje do mês passado)
    const ordersAnteriorCards = await fetchAllOrdersForPeriod(dataInicialAnteriorCardsISO, dataFinalAnteriorCardsISO);
    let totalPedidosAnteriorCards = 0;
    let totalValorAnteriorCards = 0;
    let totalValorLiquidoAnteriorCards = 0;
    let totalFreteAnteriorCards = 0;
    let totalPedidosAnteriorCardsBaseCancel = 0;
    let canceladosAnteriorCardsBase = 0;
    const vendasPorDiaAnteriorCards: Map<string, DiaResumo> = new Map();
    const pedidosPorSituacaoAnteriorCards: Map<number, SituacaoResumo> = new Map();

    for (const order of ordersAnteriorCards) {
      if (aplicarCorteHoraAnteriorCards) {
        const minutosInsercao = minutesOfDayInTimeZone(order.inserted_at, DEFAULT_REPORT_TIMEZONE);
        if (
          minutosInsercao !== null &&
          horaComparacaoMinutos !== null &&
          minutosInsercao > horaComparacaoMinutos
        ) {
          continue;
        }
      }
      const data = extrairDataISO(order.data_criacao);
      const valor = parseValorTiny(order.valor);
      const freteFallback = parseValorTiny(order.valor_frete);
      const { bruto, liquido, frete } = extrairValoresDoTiny(order.raw, {
        valorBruto: valor,
        valorFrete: freteFallback,
      });
      const valorFinal = bruto > 0 ? bruto : valor;
      const situacao = typeof order.situacao === 'number'
        ? order.situacao
        : Number(order.situacao) || 0;
      const canal = normalizarCanalTiny(order.canal);

      const passaCanal =
        !canaisFiltro || canaisFiltro.length === 0
          ? true
          : canaisFiltro.includes(canal);

      const passaSituacao =
        !situacoesFiltro || situacoesFiltro.length === 0
          ? true
          : situacoesFiltro.includes(situacao);

      if (passaCanal) {
        totalPedidosAnteriorCardsBaseCancel += 1;
        if (CANCELAMENTO_SITUACOES.has(situacao)) {
          canceladosAnteriorCardsBase += 1;
        }
      }

      if (!passaCanal || !passaSituacao) continue;

      totalPedidosAnteriorCards += 1;
      totalValorAnteriorCards += valorFinal;
      totalValorLiquidoAnteriorCards += liquido;
      totalFreteAnteriorCards += frete;

      if (data) {
        const diaKey = data;
        const current = vendasPorDiaAnteriorCards.get(diaKey) || { data: diaKey, quantidade: 0, totalDia: 0 };
        current.quantidade += 1;
        current.totalDia += valorFinal;
        vendasPorDiaAnteriorCards.set(diaKey, current);
      }

      const sitKey = situacao;
      const currentSit = pedidosPorSituacaoAnteriorCards.get(sitKey) || {
        situacao: sitKey,
        descricao: descricaoSituacao(sitKey),
        quantidade: 0,
      };
      currentSit.quantidade += 1;
      pedidosPorSituacaoAnteriorCards.set(sitKey, currentSit);
    }

    const periodoAnteriorCards: PeriodoResumo = {
      dataInicial: dataInicialAnteriorCardsStr,
      dataFinal: dataFinalAnteriorCardsStr,
      dias: diasPeriodo,
      totalPedidos: totalPedidosAnteriorCards,
      totalValor: totalValorAnteriorCards,
      totalValorLiquido: Math.max(0, totalValorAnteriorCards - totalFreteAnteriorCards),
      totalFreteTotal: totalFreteAnteriorCards,
      ticketMedio:
        totalPedidosAnteriorCards > 0
          ? totalValorAnteriorCards / totalPedidosAnteriorCards
          : 0,
      vendasPorDia: Array.from(vendasPorDiaAnteriorCards.values()),
      pedidosPorSituacao: Array.from(pedidosPorSituacaoAnteriorCards.values()),
      totalProdutosVendidos: 0,
      percentualCancelados:
        totalPedidosAnteriorCardsBaseCancel > 0
          ? (canceladosAnteriorCardsBase / totalPedidosAnteriorCardsBaseCancel) * 100
          : 0,
      topProdutos: [],
    };

    const resposta: DashboardResposta = {
      periodoAtual,
      periodoAnterior,
      periodoAnteriorCards,
      canais,
      canaisDisponiveis: Array.from(canaisDisponiveisSet),
      situacoesDisponiveis: [...TODAS_SITUACOES],
      mapaVendasUF: Array.from(mapaUFAtual.entries())
        .map(([uf, info]) => ({ uf, totalValor: info.totalValor, totalPedidos: info.totalPedidos }))
        .sort((a, b) => b.totalValor - a.totalValor),
      mapaVendasCidade: Array.from(mapaCidadeAtual.entries())
        .map(([key, info]) => ({ cidade: key.split('|')[0], uf: info.uf, totalValor: info.totalValor, totalPedidos: info.totalPedidos }))
        .sort((a, b) => b.totalValor - a.totalValor),
    };

    return NextResponse.json(resposta);
  } catch (error) {
    console.error('[API] Erro em /api/tiny/dashboard/resumo', error);
    return NextResponse.json(
      {
        message: 'Erro ao montar resumo do dashboard',
        details: getErrorMessage(error) ?? 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
