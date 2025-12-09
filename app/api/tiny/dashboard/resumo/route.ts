// app/api/tiny/dashboard/resumo/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getErrorMessage } from '@/lib/errors';
import { descricaoSituacao, parseValorTiny, TODAS_SITUACOES } from '@/lib/tinyMapping';
import { resolveParentChain } from '@/lib/productRelationships';
import type {
  ProdutoParentInfo,
  ProdutoParentMapping,
} from '@/lib/productRelationships';
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
  vendasPorHora: HoraTrend[];
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

type ProdutoSerieDia = {
  data: string;
  quantidade: number;
  receita: number;
};

type ProdutoZoomNivel = 'pai' | 'variacao' | 'kit' | 'simples' | 'origem' | 'desconhecido';

type ProdutoZoomLevel = {
  key: string;
  produtoId: number | null;
  sku?: string | null;
  descricao: string;
  tipo?: TinyProdutosRow['tipo'] | null;
  nivel: ProdutoZoomNivel;
  childSource?: ProdutoParentInfo['childSource'] | null;
  quantidade: number;
  receita: number;
  serieDiaria?: ProdutoSerieDia[];
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
  serieDiaria?: ProdutoSerieDia[];
  zoomLevels?: ProdutoZoomLevel[];
};

type HoraTrend = {
  label: string;
  hoje: number;
  ontem: number;
  quantidade?: number;
  quantidadeOntem?: number;
};

type MicroTrendHora = {
  horaIndex: number; // 0-23
  faturamento: number | null;
  pedidos: number | null;
};

type MicroTrendWindow24h = {
  start: string;
  end: string;
  seriesPorHora: MicroTrendHora[];
};

type MicroTrend24h = {
  currentWindow: MicroTrendWindow24h;
  previousWindow: MicroTrendWindow24h;
};

type ProdutoZoomLevelInternal = {
  key: string;
  produtoId: number | null;
  sku?: string | null;
  descricao: string;
  tipo?: TinyProdutosRow['tipo'] | null;
  nivel: ProdutoZoomNivel;
  childSource?: ProdutoParentInfo['childSource'] | null;
  quantidade: number;
  receita: number;
  ordem: number;
  serieDiariaMap?: Record<string, { quantidade: number; receita: number }>;
};

type ProdutoResumoInterno = ProdutoResumo & {
  serieDiariaMap?: Record<string, { quantidade: number; receita: number }>;
  zoomLevelsMap?: Map<string, ProdutoZoomLevelInternal>;
};

const buildProdutoInternalKey = (
  produtoId: number | null | undefined,
  descricao: string,
  sku?: string | null
) => {
  if (typeof produtoId === 'number' && Number.isFinite(produtoId)) {
    return `id:${produtoId}`;
  }
  const base = descricao?.trim() || 'Produto sem nome';
  return `${base}-${sku ?? ''}`;
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

type DebugOrderEntry = {
  id: number | null;
  tiny_id: number | null;
  situacao: number;
  canal: string | null;
  data_criacao: string | null;
  dataRefResumo: string;
  motivoExclusao?: string;
};

type OrderSummaryRow = Pick<
  TinyOrdersRow,
  | 'id'
  | 'tiny_id'
  | 'data_criacao'
  | 'valor'
  | 'valor_frete'
  | 'situacao'
  | 'canal'
  | 'raw'
  | 'inserted_at'
  | 'updated_at'
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

type MetricDiff = {
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number | null;
};

type DashboardDiffs = {
  faturamento: MetricDiff;
  pedidos: MetricDiff;
  ticketMedio: MetricDiff;
  // campos legados mantidos para compatibilidade
  faturamentoDelta: number;
  faturamentoDeltaPercent: number | null;
  faturamentoHasComparison: boolean;
  pedidosDelta: number;
  pedidosDeltaPercent: number | null;
  pedidosHasComparison: boolean;
  ticketMedioDelta: number;
  ticketMedioDeltaPercent: number | null;
  ticketMedioHasComparison: boolean;
};

type DashboardResposta = {
  current: PeriodoResumo;
  previous: PeriodoResumo;
  diffs: DashboardDiffs;
  microTrend24h?: MicroTrend24h;
  canais: CanalResumo[];
  canaisDisponiveis: string[];
  situacoesDisponiveis: Array<{ codigo: number; descricao: string }>;
  mapaVendasUF: VendasUF[];
  mapaVendasCidade: VendasCidade[];
  lastUpdatedAt: string | null;
  // aliases legados para compatibilidade com o dashboard existente
  periodoAtual: PeriodoResumo;
  periodoAnterior: PeriodoResumo;
  periodoAnteriorCards: PeriodoResumo;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOURLY_TREND_HOURS = 24;
const HOURLY_TREND_LOOKBACK_MS = DAY_MS * 2;
const MICRO_TREND_WINDOW_HOURS = 24;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SUPABASE_PAGE_SIZE = 250;
const SUPABASE_MAX_ROWS = 10000;
const DASHBOARD_FETCH_PAGE_SIZE = 500; // batches for long-range queries
const DASHBOARD_FETCH_MAX_PAGES = 400; // safeguards ~200k rows per fetch
const SUPABASE_MAX_RETRIES = 3;
const NETWORKISH_ERROR = /(fetch failed|Failed to fetch|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network request failed)/i;
const DEFAULT_REPORT_TIMEZONE = 'America/Sao_Paulo';
const VALID_SITUACOES_PADRAO = [0, 1, 3, 4, 5, 6, 7];
const SITUACAO_CANCELADA = 2;

const nowInTimeZone = (timeZone: string): Date => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')));
};

const startOfDayInTimeZone = (base: Date, timeZone: string): Date => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(base);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const year = get('year');
  const month = get('month');
  const day = get('day');

  // Para America/Sao_Paulo (sem DST atual), meia-noite local = 03:00Z.
  // Ajuste direto evita drift observado (começando 21:00Z).
  if (timeZone === 'America/Sao_Paulo') {
    return new Date(`${year}-${month}-${day}T03:00:00.000Z`);
  }

  // Fallback genérico: usa rótulo de data em UTC (pode ter pequeno drift em outros timezones).
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
};

// Usa inserted_at como referência de corte horário na zona America/Sao_Paulo
const getCutoffMinutesNowSp = (): number => {
  const now = new Date();
  const minutes = minutesOfDayInTimeZone(now.toISOString(), DEFAULT_REPORT_TIMEZONE);
  return minutes !== null ? minutes : 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asTinyOrderRaw = (value: Json | null): TinyOrderRawPayload | null =>
  isRecord(value) ? (value as TinyOrderRawPayload) : null;

const asTinyItem = (value: unknown): TinyRawItem | null =>
  isRecord(value) ? (value as TinyRawItem) : null;

function getOrderDateForResumo(order: OrderSummaryRow): string {
  const raw = asTinyOrderRaw(order.raw ?? null);
  const pedido = raw?.pedido as Record<string, unknown> | undefined;

  const candidates: Array<string | undefined> = [
    pedido?.dataPedido as string | undefined,
    pedido?.data as string | undefined,
    (raw as any)?.dataPedido as string | undefined,
    (raw as any)?.data as string | undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    let value = candidate.trim();

    const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brMatch) {
      const [, dd, mm, yyyy] = brMatch;
      value = `${yyyy}-${mm}-${dd}`;
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
  }

  if (typeof order.data_criacao === 'string' && order.data_criacao.length >= 10) {
    return order.data_criacao.slice(0, 10);
  }

  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

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

const updateSerieDiaria = (
  alvo: ProdutoResumoInterno,
  dataPedido: string | null | undefined,
  quantidade: number,
  receita: number
) => {
  if (!dataPedido) return;
  const dia = dataPedido.slice(0, 10);
  if (!dia) return;
  const serie = alvo.serieDiariaMap ?? (alvo.serieDiariaMap = {});
  const atual = serie[dia] ?? { quantidade: 0, receita: 0 };
  atual.quantidade += quantidade;
  atual.receita += receita;
  serie[dia] = atual;
};

const mergeSerieDiariaMap = (
  destino: ProdutoResumoInterno,
  origem?: ProdutoResumoInterno['serieDiariaMap']
) => {
  if (!origem) return;
  const alvo = destino.serieDiariaMap ?? (destino.serieDiariaMap = {});
  for (const [dia, valores] of Object.entries(origem)) {
    const atual = alvo[dia] ?? { quantidade: 0, receita: 0 };
    atual.quantidade += valores.quantidade;
    atual.receita += valores.receita;
    alvo[dia] = atual;
  }
};

const mergeSerieDiariaIntoZoom = (
  destino: ProdutoZoomLevelInternal,
  origem?: ProdutoResumoInterno['serieDiariaMap']
) => {
  if (!origem) return;
  const alvo = destino.serieDiariaMap ?? (destino.serieDiariaMap = {});
  for (const [dia, valores] of Object.entries(origem)) {
    const atual = alvo[dia] ?? { quantidade: 0, receita: 0 };
    atual.quantidade += valores.quantidade;
    atual.receita += valores.receita;
    alvo[dia] = atual;
  }
};

const serializeSerieFromMap = (
  serieDiariaMap?: Record<string, { quantidade: number; receita: number }>
): ProdutoSerieDia[] | undefined => {
  if (!serieDiariaMap) return undefined;
  return Object.entries(serieDiariaMap)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([data, info]) => ({ data, quantidade: info.quantidade, receita: info.receita }));
};

const buildZoomLevelKey = (
  produtoId: number | null,
  sku: string | null,
  nivel: ProdutoZoomNivel,
  descricao: string
): string => {
  const idSegment = produtoId ?? 'null';
  const skuSegment = sku ?? descricao ?? 'sem-descricao';
  return `${nivel}:${idSegment}:${skuSegment}`;
};

const normalizeSkuValue = (sku?: string | null): string | null => {
  if (typeof sku !== 'string') return null;
  const trimmed = sku.trim();
  return trimmed || null;
};

const inferZoomNivelFromParent = (
  parentInfo: ProdutoParentInfo,
  isFinal: boolean
): ProdutoZoomNivel => {
  const tipo = typeof parentInfo.parentTipo === 'string' ? parentInfo.parentTipo.trim().toUpperCase() : null;
  if (tipo === 'K') return 'kit';
  if (tipo === 'P') return 'pai';
  if (tipo === 'S') return 'simples';
  if (tipo === 'V') return isFinal ? 'pai' : 'variacao';
  if (parentInfo.childSource === 'kit') return 'kit';
  if (parentInfo.childSource === 'variacoes') return isFinal ? 'pai' : 'variacao';
  return 'desconhecido';
};

type ZoomNodeSeed = {
  produtoId: number | null;
  sku: string | null;
  descricao: string;
  tipo: TinyProdutosRow['tipo'] | null | undefined;
  nivel: ProdutoZoomNivel;
  ordem: number;
  childSource?: ProdutoParentInfo['childSource'] | null;
};

const collectZoomNodes = (
  produto: ProdutoResumoInterno,
  parentResolution: ReturnType<typeof resolveParentChain>
): ZoomNodeSeed[] => {
  const nodes: ZoomNodeSeed[] = [];
  const chain = parentResolution.chain ?? [];
  const totalChain = chain.length;

  chain.forEach((info, idx) => {
    const isFinal = idx === totalChain - 1;
    nodes.push({
      produtoId: info.parentId ?? null,
      sku: normalizeSkuValue(info.parentCodigo ?? null),
      descricao: info.parentNome,
      tipo: info.parentTipo,
      nivel: inferZoomNivelFromParent(info, isFinal),
      ordem: totalChain - idx,
      childSource: info.childSource ?? null,
    });
  });

  nodes.push({
    produtoId: produto.produtoId ?? null,
    sku: normalizeSkuValue(produto.sku ?? null),
    descricao: produto.descricao,
    tipo: undefined,
    nivel: totalChain ? 'origem' : 'simples',
    ordem: 0,
    childSource: null,
  });

  return nodes;
};

function registrarProduto(
  map: Map<string, ProdutoResumoInterno>,
  item: TinyRawItem | null,
  dataPedido?: string | null
) {
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
  const key = buildProdutoInternalKey(produtoId, descricaoBase, skuCandidate);
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

  const atual: ProdutoResumoInterno = map.get(key) ?? {
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

  updateSerieDiaria(atual, dataPedido ?? null, quantidade, receita);

  map.set(key, atual);
}

function registrarProdutoPersistido(
  map: Map<string, ProdutoResumoInterno>,
  item: TinyPedidoItemWithProduto | null,
  dataPedido?: string | null
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
  const key = buildProdutoInternalKey(produtoId, descricao, sku);

  const atual: ProdutoResumoInterno = map.get(key) ?? {
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

  updateSerieDiaria(atual, dataPedido ?? null, quantidade, receita);

  map.set(key, atual);
}

const consolidarProdutosPorPai = (
  mapa: Map<string, ProdutoResumoInterno>,
  relacionamentos: ProdutoParentMapping
): Map<string, ProdutoResumoInterno> => {
  if (!mapa.size) return mapa;
  const possuiRelacionamentos =
    relacionamentos.idToParent.size > 0 || relacionamentos.codeToParent.size > 0;
  if (!possuiRelacionamentos) return mapa;

  const resultado = new Map<string, ProdutoResumoInterno>();

  mapa.forEach((produto) => {
    const skuNormalizado = typeof produto.sku === 'string' ? produto.sku.trim() : null;
    const parentResolution = resolveParentChain(
      produto.produtoId,
      skuNormalizado,
      relacionamentos
    );
    const parentInfo = parentResolution.finalParent;
    const zoomNodes = collectZoomNodes(produto, parentResolution);

    if (parentResolution.chain.length > 1) {
      console.log('[Dashboard] Chain consolidada', {
        produtoId: produto.produtoId,
        sku: produto.sku,
        chain: parentResolution.chain.map((info) => ({
          id: info.parentId,
          codigo: info.parentCodigo,
          nome: info.parentNome,
          tipo: info.parentTipo,
        })),
      });
    }

    const targetProdutoId = parentInfo?.parentId ?? produto.produtoId ?? null;
    const targetSku = parentInfo?.parentCodigo ?? skuNormalizado ?? produto.sku ?? null;
    const targetDescricao = parentInfo?.parentNome ?? produto.descricao;
    const targetImagem = parentInfo?.parentImagemUrl ?? produto.imagemUrl ?? undefined;

    const key = buildProdutoInternalKey(targetProdutoId, targetDescricao, targetSku);

    const existente: ProdutoResumoInterno = resultado.get(key) ?? {
      produtoId: targetProdutoId,
      sku: targetSku ?? undefined,
      descricao: targetDescricao,
      quantidade: 0,
      receita: 0,
      imagemUrl: targetImagem,
      saldo: produto.saldo,
      reservado: produto.reservado,
      disponivel: produto.disponivel,
      serieDiariaMap: undefined,
      zoomLevelsMap: undefined,
    };

    existente.quantidade += produto.quantidade;
    existente.receita += produto.receita;

    if (!existente.imagemUrl && targetImagem) {
      existente.imagemUrl = targetImagem;
    }

    if (existente.saldo == null && produto.saldo != null) existente.saldo = produto.saldo;
    if (existente.reservado == null && produto.reservado != null)
      existente.reservado = produto.reservado;
    if (existente.disponivel == null && produto.disponivel != null)
      existente.disponivel = produto.disponivel;

    mergeSerieDiariaMap(existente, produto.serieDiariaMap);

    if (zoomNodes.length) {
      const zoomMap = existente.zoomLevelsMap ?? (existente.zoomLevelsMap = new Map());
      for (const node of zoomNodes) {
        const zoomKey = buildZoomLevelKey(node.produtoId, node.sku, node.nivel, node.descricao);
        const atual = zoomMap.get(zoomKey) ?? {
          key: zoomKey,
          produtoId: node.produtoId,
          sku: node.sku,
          descricao: node.descricao,
          tipo: node.tipo ?? null,
          nivel: node.nivel,
          childSource: node.childSource ?? null,
          quantidade: 0,
          receita: 0,
          ordem: node.ordem,
          serieDiariaMap: undefined,
        };

        atual.quantidade += produto.quantidade;
        atual.receita += produto.receita;
        if (node.ordem > atual.ordem) atual.ordem = node.ordem;
        if (!atual.sku && node.sku) atual.sku = node.sku;
        if (!atual.produtoId && node.produtoId) atual.produtoId = node.produtoId;
        if (!atual.tipo && node.tipo) atual.tipo = node.tipo;
        mergeSerieDiariaIntoZoom(atual, produto.serieDiariaMap);

        zoomMap.set(zoomKey, atual);
      }
    }

    resultado.set(key, existente);
  });

  return resultado;
};

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

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function shiftIsoDate(dateIso: string, dias: number): string {
  const parts = dateIso.split('-');
  if (parts.length !== 3) return dateIso;
  const [year, month, day] = parts.map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateIso;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + dias);
  return date.toISOString().slice(0, 10);
}

function isFirstDayOfMonth(dateIso: string | null | undefined): boolean {
  if (!dateIso) return false;
  return dateIso.endsWith('-01');
}

function endOfMonthIso(dateIso: string): string {
  const parts = dateIso.split('-');
  if (parts.length !== 3) return dateIso;
  const [year, month] = parts.map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return dateIso;
  const d = new Date(Date.UTC(year, month - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

function startOfPreviousMonthIso(dateIso: string): string {
  const parts = dateIso.split('-');
  if (parts.length !== 3) return dateIso;
  const [year, month] = parts.map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return dateIso;
  const d = new Date(Date.UTC(year, month - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

function minutesOfDayInTimeZone(dateInput: string | null | undefined, timeZone: string): number | null {
  if (!dateInput) return null;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateInput);
  if (isDateOnly) return 0;
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
type CacheOrderFact = {
  data: string;
  canal: string | null;
  situacao: number | null;
  cidade: string | null;
  uf: string | null;
  pedidos: number;
  valor_bruto: number;
  valor_frete: number;
  valor_liquido: number;
};

type CacheProdutoFact = {
  data: string;
  canal: string | null;
  situacao: number | null;
  produto_id: number;
  sku: string | null;
  descricao: string;
  quantidade: number;
  receita: number;
};

type ProdutoItemRowForRange = {
  id_pedido: number;
  id_produto_tiny: number | null;
  codigo_produto: string | null;
  nome_produto: string | null;
  quantidade: number | null;
  valor_total: number | null;
  valor_unitario: number | null;
  tiny_orders: {
    data_criacao: string | null;
    canal: string | null;
    situacao: number | null;
    inserted_at: string | null;
  } | null;
};
 
 type OrderRowForRange = {
   data_criacao: string | null;
   canal: string | null;
   situacao: number | null;
   cidade: string | null;
   uf: string | null;
   valor: number | null;
   valor_frete: number | null;
   inserted_at?: string | null;
 };

const toNumberSafe = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const withinRange = (dateStr: string | null | undefined, inicio: string, fimExclusive: string) => {
  if (!dateStr) return false;
  return dateStr >= inicio && dateStr < fimExclusive;
};

type CutoffOptions = {
  cutoffDate?: string | null;
  cutoffMinutes?: number | null;
  timeZone?: string;
};

const filterProdutoRowsWithCutoff = (
  rows: ProdutoItemRowForRange[],
  inicio: string,
  fimExclusive: string,
  canaisFiltro: string[] | null,
  situacoesFiltro: number[] | null,
  opts?: CutoffOptions
) =>
  rows.filter((row) => {
    const pedido = row.tiny_orders ?? null;
    const dataStr = pedido?.data_criacao ?? '';
    if (!withinRange(dataStr, inicio, fimExclusive)) return false;

    const canalPedido = pedido?.canal ?? 'Outros';
    if (canaisFiltro?.length && (canalPedido ? !canaisFiltro.includes(canalPedido) : true)) return false;

    const situacaoPedido = typeof pedido?.situacao === 'number' ? pedido.situacao : toNumberSafe(pedido?.situacao ?? -1);
    if (situacoesFiltro?.length && !situacoesFiltro.includes(situacaoPedido)) return false;

    if (opts?.cutoffDate && opts.cutoffMinutes !== null && opts.cutoffMinutes !== undefined) {
      if (dataStr.slice(0, 10) === opts.cutoffDate) {
        const minutes = minutesOfDayInTimeZone(
          pedido?.inserted_at ?? dataStr,
          opts.timeZone ?? DEFAULT_REPORT_TIMEZONE
        );
        if (minutes !== null && minutes > opts.cutoffMinutes) return false;
      }
    }

    return true;
  });

const aggregateProdutoFactsFromRows = (rows: ProdutoItemRowForRange[]): CacheProdutoFact[] => {
  const produtoFactsMap = aggregateMap(
    rows,
    (item) => {
      const pedido = item.tiny_orders ?? {
        data_criacao: null,
        canal: null,
        situacao: null,
        inserted_at: null,
      };
      return `${pedido.data_criacao ?? ''}|${pedido.canal ?? 'Outros'}|${pedido.situacao ?? -1}|${item.id_produto_tiny ?? 0}|${item.codigo_produto ?? ''}`;
    },
    (acc: any, item) => {
      const pedido = item.tiny_orders ?? {
        data_criacao: null,
        canal: null,
        situacao: null,
        inserted_at: null,
      };
      acc.data = pedido.data_criacao ?? null;
      acc.canal = pedido.canal ?? 'Outros';
      acc.situacao = typeof pedido.situacao === 'number' ? pedido.situacao : toNumberSafe(pedido.situacao ?? -1);
      acc.produto_id = typeof item.id_produto_tiny === 'number' ? item.id_produto_tiny : 0;
      acc.sku = item.codigo_produto ?? null;
      acc.descricao = item.nome_produto ?? 'Produto sem nome';
      const quantidade = toNumberSafe(item.quantidade ?? 0);
      const receita = toNumberSafe(item.valor_total ?? item.valor_unitario ?? 0);
      acc.quantidade = (acc.quantidade ?? 0) + quantidade;
      acc.receita = (acc.receita ?? 0) + receita;
    }
  );

  return Array.from(produtoFactsMap.values()).filter((f) => !!f.data);
};

const aggregateMap = <T, K extends string | number>(items: T[], keyGetter: (item: T) => K, updater: (acc: any, item: T) => void) => {
  const map = new Map<K, any>();
  items.forEach((item) => {
    const key = keyGetter(item);
    const current = map.get(key) ?? {};
    updater(current, item);
    map.set(key, current);
  });
  return map;
};

const fetchProdutoFactsRange = async (
  dataInicialStr: string,
  dataFinalExclusive: string,
  canaisFiltro: string[] | null,
  situacoesFiltro: number[] | null
): Promise<ProdutoItemRowForRange[]> => {
  const rows: ProdutoItemRowForRange[] = [];
  const mapRow = (item: any): ProdutoItemRowForRange => {
    const pedido = item?.tiny_orders ?? {};
    return {
      id_pedido: item.id_pedido as number,
      id_produto_tiny: item.id_produto_tiny ?? null,
      codigo_produto: item.codigo_produto ?? null,
      nome_produto: item.nome_produto ?? null,
      quantidade: item.quantidade ?? null,
      valor_total: item.valor_total ?? null,
      valor_unitario: item.valor_unitario ?? null,
      tiny_orders: {
        data_criacao: pedido.data_criacao ?? null,
        canal: pedido.canal ?? null,
        situacao: typeof pedido.situacao === 'number' ? pedido.situacao : toNumberSafe(pedido.situacao ?? -1),
        inserted_at: pedido.inserted_at ?? null,
      },
    };
  };

  let truncated = false;
  for (let page = 0; page < DASHBOARD_FETCH_MAX_PAGES; page += 1) {
    const from = page * DASHBOARD_FETCH_PAGE_SIZE;
    const to = from + DASHBOARD_FETCH_PAGE_SIZE - 1;

    let query = supabaseAdmin
      .from('tiny_pedido_itens')
      .select(
        `
          id_pedido,
          id_produto_tiny,
          codigo_produto,
          nome_produto,
          quantidade,
          valor_total,
          valor_unitario,
          tiny_orders!inner(data_criacao, canal, situacao, inserted_at)
        `
      )
      .gte('tiny_orders.data_criacao', dataInicialStr)
      .lt('tiny_orders.data_criacao', dataFinalExclusive)
      .order('data_criacao', { referencedTable: 'tiny_orders', ascending: true, nullsFirst: false })
      .order('id_pedido', { ascending: true })
      .range(from, to);

    if (canaisFiltro?.length) {
      query = query.in('tiny_orders.canal', canaisFiltro);
    }
    if (situacoesFiltro?.length) {
      query = query.in('tiny_orders.situacao', situacoesFiltro);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[dashboard] falha ao buscar itens para top produtos', { error, page });
      break;
    }

    const chunk = (data ?? []).map(mapRow);
    rows.push(...chunk);

    if (chunk.length < DASHBOARD_FETCH_PAGE_SIZE) {
      break;
    }
    if (page === DASHBOARD_FETCH_MAX_PAGES - 1) {
      truncated = true;
    }
  }

  if (truncated) {
    console.warn('[dashboard] itens de produtos truncados pelo limite de paginação', {
      dataInicialStr,
      dataFinalExclusive,
      total: rows.length,
    });
  }

  return rows;
};

const buildHourlyTrendSeries = (
  todayBuckets: Map<number, { valor: number; quantidade: number }>,
  yesterdayBuckets: Map<number, { valor: number; quantidade: number }>
): HoraTrend[] => {
  const series: HoraTrend[] = [];
  for (let hour = 0; hour < HOURLY_TREND_HOURS; hour += 1) {
    const todayBucket = todayBuckets.get(hour);
    const yesterdayBucket = yesterdayBuckets.get(hour);
    series.push({
      label: `${hour.toString().padStart(2, '0')}h`,
      hoje: todayBucket?.valor ?? 0,
      ontem: yesterdayBucket?.valor ?? 0,
      quantidade: todayBucket?.quantidade ?? 0,
      quantidadeOntem: yesterdayBucket?.quantidade ?? 0,
    });
  }
  return series;
};

const buildHourlyTrend = async (
  timeZone: string,
  canaisFiltro: string[] | null,
  situacoesAplicadas: number[]
): Promise<HoraTrend[]> => {
  const todayLabel = formatDateInTimeZone(new Date(), timeZone);
  const yesterdayLabel = shiftIsoDate(todayLabel, -1);
  const rangeStart = new Date(Date.now() - HOURLY_TREND_LOOKBACK_MS);
  const rangeEnd = new Date();
  const cutoffMinutes = getCutoffMinutesNowSp();
  try {
    let query = supabaseAdmin
      .from('tiny_orders')
      .select('valor,inserted_at,updated_at,situacao,canal')
      .gte('inserted_at', rangeStart.toISOString())
      .lte('inserted_at', rangeEnd.toISOString());

    if (situacoesAplicadas.length) {
      query = query.in('situacao', situacoesAplicadas);
    }

    if (canaisFiltro?.length) {
      query = query.in('canal', canaisFiltro);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[dashboard] falha ao carregar microtrend por hora', error);
      return buildHourlyTrendSeries(new Map(), new Map());
    }

    const todayBuckets = new Map<number, { valor: number; quantidade: number }>();
    const yesterdayBuckets = new Map<number, { valor: number; quantidade: number }>();
    for (const row of data ?? []) {
      const timestamp = (row as any).updated_at ?? (row as any).inserted_at;
      if (!timestamp) continue;
      const parsedDate = new Date(timestamp);
      if (Number.isNaN(parsedDate.getTime())) continue;
      const dayLabel = formatDateInTimeZone(parsedDate, timeZone);
      const minutes = minutesOfDayInTimeZone(timestamp, timeZone);
      if (minutes === null) continue;
      if ((dayLabel === todayLabel || dayLabel === yesterdayLabel) && minutes > cutoffMinutes) continue;
      const hour = Math.min(HOURLY_TREND_HOURS - 1, Math.max(0, Math.floor(minutes / 60)));
      const targetBuckets =
        dayLabel === todayLabel ? todayBuckets : dayLabel === yesterdayLabel ? yesterdayBuckets : null;
      if (!targetBuckets) continue;
      const bucket = targetBuckets.get(hour) ?? { valor: 0, quantidade: 0 };
      bucket.valor += toNumberSafe((row as any).valor ?? 0);
      bucket.quantidade += 1;
      targetBuckets.set(hour, bucket);
    }

    return buildHourlyTrendSeries(todayBuckets, yesterdayBuckets);
  } catch (error) {
    console.error('[dashboard] erro ao montar microtrend por hora', error);
    return buildHourlyTrendSeries(new Map(), new Map());
  }
};

type MicroTrendWindowOverride = {
  currentStart?: Date | null;
  currentEnd?: Date | null;
  previousStart?: Date | null;
  previousEnd?: Date | null;
};

const buildMicroTrend24h = async (
  timeZone: string,
  canaisFiltro: string[] | null,
  situacoesFiltro: number[] | null,
  overrides?: MicroTrendWindowOverride
): Promise<MicroTrend24h> => {
  const hoursCount = 24;
  const hourMs = 60 * 60 * 1000;

  const nowTz = nowInTimeZone(timeZone);
  // Ancorar as janelas em dias-calendário locais (00:00–23:59) em vez de "últimas 24h" rolando.
  // current = hoje 0h–23h, previous = ontem 0h–23h.
  const startToday = startOfDayInTimeZone(nowTz, timeZone);
  const defaultCurrentStart = startToday;
  const defaultCurrentEnd = new Date(startToday.getTime() + MICRO_TREND_WINDOW_HOURS * hourMs);
  const defaultPreviousEnd = new Date(startToday.getTime());
  const defaultPreviousStart = new Date(defaultPreviousEnd.getTime() - MICRO_TREND_WINDOW_HOURS * hourMs);

  const currentStart = overrides?.currentStart && !Number.isNaN(overrides.currentStart.getTime())
    ? overrides.currentStart
    : defaultCurrentStart;
  const currentEnd = overrides?.currentEnd && !Number.isNaN(overrides.currentEnd.getTime())
    ? overrides.currentEnd
    : defaultCurrentEnd;
  const previousStart = overrides?.previousStart && !Number.isNaN(overrides.previousStart.getTime())
    ? overrides.previousStart
    : defaultPreviousStart;
  const previousEnd = overrides?.previousEnd && !Number.isNaN(overrides.previousEnd.getTime())
    ? overrides.previousEnd
    : defaultPreviousEnd;

  // Para filtrar, usamos o range de dias (data_criacao é YYYY-MM-DD sem hora)
  // Precisamos apenas dos pedidos de "ontem" e "hoje" no calendário local.
  const previousLabel = formatDateInTimeZone(previousStart, timeZone);
  const currentLabel = formatDateInTimeZone(currentStart, timeZone);
  const startDate = previousLabel;
  const endDate = shiftIsoDate(currentLabel, 1); // exclusivo: amanhã

  let query = supabaseAdmin
    .from('tiny_orders')
    .select('id,numero_pedido,valor,data_criacao,raw,canal,situacao')
    .gte('data_criacao', startDate)
    .lt('data_criacao', endDate)
    .limit(SUPABASE_MAX_ROWS);

  if (canaisFiltro?.length) {
    query = query.in('canal', canaisFiltro);
  }
  if (situacoesFiltro?.length) {
    query = query.in('situacao', situacoesFiltro);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[dashboard] erro ao buscar microtrend 24h', error);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[dashboard-debug] microtrend_raw_rows', {
      total: data?.length ?? 0,
      sample: (data ?? []).slice(0, 5).map((row) => ({
        id: (row as any).id,
        data_criacao: (row as any).data_criacao,
        valor: (row as any).valor,
        canal: (row as any).canal,
        situacao: (row as any).situacao,
      })),
      window: { startDate, endDate },
    });
  }

  // Função helper para extrair timestamp completo do raw (dataPedido tem hora)
  const getFullTimestamp = (row: Record<string, unknown>): Date | null => {
    const rawObj = asTinyOrderRaw((row as any).raw ?? null);
    const pedido = rawObj?.pedido as Record<string, unknown> | undefined;
    
    // Tenta extrair dataPedido do raw (formato DD/MM/YYYY HH:mm:ss ou YYYY-MM-DD HH:mm:ss)
    const candidates: Array<string | undefined> = [
      pedido?.dataPedido as string | undefined,
      (rawObj as any)?.dataPedido as string | undefined,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const trimmed = candidate.trim();
      
      // Formato BR: DD/MM/YYYY HH:mm:ss
      const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?/);
      if (brMatch) {
        const [, dd, mm, yyyy, hh, min, ss = '00'] = brMatch;
        const isoStr = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
        const parsed = new Date(isoStr);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }

      // Formato ISO: YYYY-MM-DD HH:mm:ss ou YYYY-MM-DDTHH:mm:ss
      const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2}):?(\d{2})?/);
      if (isoMatch) {
        const [, datePart, hh, min, ss = '00'] = isoMatch;
        const isoStr = `${datePart}T${hh}:${min}:${ss}`;
        const parsed = new Date(isoStr);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
    }

    // Fallback: distribuir pedidos uniformemente pelo dia (0-23h) baseado em hash do numero_pedido
    // Isso cria uma distribuição visual razoável quando não temos hora real
    const dataCriacao = (row as any).data_criacao as string | null;
    const numeroPedido = (row as any).numero_pedido ?? (row as any).id ?? 0;
    if (dataCriacao && /^\d{4}-\d{2}-\d{2}/.test(dataCriacao)) {
      // Usa hash do numero_pedido para distribuir entre 0-23h de forma determinística
      const hash = typeof numeroPedido === 'number' ? numeroPedido : String(numeroPedido).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const fakeHour = hash % 24;
      const parsed = new Date(`${dataCriacao.slice(0, 10)}T${String(fakeHour).padStart(2, '0')}:00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return null;
  };

  const currentBuckets = Array.from({ length: hoursCount }, () => ({ valor: 0, pedidos: 0 }));
  const previousBuckets = Array.from({ length: hoursCount }, () => ({ valor: 0, pedidos: 0 }));

  for (const row of data ?? []) {
    // Microtrend usa dataPedido do raw (com hora) para distribuição por hora.
    // data_criacao é apenas YYYY-MM-DD, então precisamos do raw para a hora.
    const ts = getFullTimestamp(row as Record<string, unknown>);
    if (!ts) continue;

    if (ts >= currentStart && ts < currentEnd) {
      const idx = Math.floor((ts.getTime() - currentStart.getTime()) / hourMs);
      if (idx >= 0 && idx < hoursCount) {
        currentBuckets[idx].valor += toNumberSafe((row as any).valor ?? 0);
        currentBuckets[idx].pedidos += 1;
      }
      continue;
    }

    if (ts >= previousStart && ts < previousEnd) {
      const idx = Math.floor((ts.getTime() - previousStart.getTime()) / hourMs);
      if (idx >= 0 && idx < hoursCount) {
        previousBuckets[idx].valor += toNumberSafe((row as any).valor ?? 0);
        previousBuckets[idx].pedidos += 1;
      }
    }
  }

  const buildSeries = (buckets: Array<{ valor: number; pedidos: number }>): MicroTrendHora[] =>
    buckets.map((bucket, idx) => ({
      horaIndex: idx,
      faturamento: bucket.valor,
      pedidos: bucket.pedidos,
    }));

  const microTrend24h: MicroTrend24h = {
    currentWindow: {
      start: currentStart.toISOString(),
      end: currentEnd.toISOString(),
      seriesPorHora: buildSeries(currentBuckets),
    },
    previousWindow: {
      start: previousStart.toISOString(),
      end: previousEnd.toISOString(),
      seriesPorHora: buildSeries(previousBuckets),
    },
  };

  const sumBuckets = (buckets: Array<{ valor: number; pedidos: number }>) =>
    buckets.reduce(
      (acc, bucket) => ({ valor: acc.valor + bucket.valor, pedidos: acc.pedidos + bucket.pedidos }),
      { valor: 0, pedidos: 0 }
    );

  console.log('[dashboard-debug] microtrend_24h_totals', {
    currentWindow: {
      start: microTrend24h.currentWindow.start,
      end: microTrend24h.currentWindow.end,
      totals: sumBuckets(currentBuckets),
    },
    previousWindow: {
      start: microTrend24h.previousWindow.start,
      end: microTrend24h.previousWindow.end,
      totals: sumBuckets(previousBuckets),
    },
  });

  console.log('[dashboard-debug] microtrend_24h', {
    currentWindow: microTrend24h.currentWindow,
    previousWindow: microTrend24h.previousWindow,
    baseTimestamp: 'raw.dataPedido',
  });

  return microTrend24h;
};

const preencherDiasAggregado = (
  inicio: string,
  fimInclusivo: string,
  diasMap: Map<string, DiaAggregado>
): DiaAggregado[] => {
  const mapa = new Map(diasMap);

  let cursor = inicio;
  while (cursor <= fimInclusivo) {
    if (!mapa.has(cursor)) {
      mapa.set(cursor, { data: cursor, pedidos: 0, faturamento: 0, frete: 0 });
    }
    cursor = shiftIsoDate(cursor, 1);
  }

  return Array.from(mapa.values()).sort((a, b) => (a.data < b.data ? -1 : 1));
};


type PeriodoComPedidos = {
  periodo: PeriodoResumo;
  pedidos: OrderSummaryRow[];
  orderFacts: CacheOrderFact[];
  debugIncluded: DebugOrderEntry[];
  debugExcluded: DebugOrderEntry[];
};

const buildPeriodoResumoFromOrders = (
  orders: OrderSummaryRow[],
  range: { start: string; end: string; dias: number },
  filtros: { situacoesCancelamento: Set<number> },
  extras?: Partial<Pick<PeriodoResumo, 'topProdutos' | 'vendasPorHora' | 'totalProdutosVendidos'>>
): { periodo: PeriodoResumo; orderFacts: CacheOrderFact[] } => {
  const vendasPorDiaMap = new Map<string, { quantidade: number; totalDia: number }>();
  const pedidosPorSituacaoMap = new Map<number, number>();
  let totalPedidos = 0;
  let totalValor = 0;
  let totalValorLiquido = 0;
  let totalFreteTotal = 0;
  const orderFacts: CacheOrderFact[] = [];

  for (const order of orders) {
    const dataRef = getOrderDateForResumo(order);
    if (!dataRef) continue;
    const dia = dataRef.slice(0, 10);

    const valorFallback = toNumberSafe((order as any).valor_total_pedido ?? (order as any).valor ?? 0);
    const freteFallback = toNumberSafe((order as any).valor_frete ?? 0);
    const valores = extrairValoresDoTiny(order.raw ?? null, {
      valorBruto: valorFallback,
      valorFrete: freteFallback,
    });

    const bruto = valores.bruto;
    const frete = valores.frete;
    const liquido = valores.liquido > 0 ? valores.liquido : Math.max(0, bruto - frete);

    totalPedidos += 1;
    totalValor += bruto;
    totalValorLiquido += liquido;
    totalFreteTotal += frete;

    const atual = vendasPorDiaMap.get(dia) ?? { quantidade: 0, totalDia: 0 };
    atual.quantidade += 1;
    atual.totalDia += bruto;
    vendasPorDiaMap.set(dia, atual);

    const situacao = typeof order.situacao === 'number' ? order.situacao : -1;
    pedidosPorSituacaoMap.set(situacao, (pedidosPorSituacaoMap.get(situacao) ?? 0) + 1);

    orderFacts.push({
      data: dia,
      pedidos: 1,
      valor_bruto: bruto,
      valor_frete: frete,
      valor_liquido: liquido,
      situacao,
      canal: order.canal ?? null,
      uf: (order as any).uf ?? null,
      cidade: (order as any).cidade ?? null,
    } as CacheOrderFact);
  }

  const vendasPorDia: DiaResumo[] = (() => {
    const dias: DiaResumo[] = [];
    let cursor = range.start;
    while (cursor <= range.end) {
      const info = vendasPorDiaMap.get(cursor);
      dias.push({
        data: cursor,
        quantidade: info?.quantidade ?? 0,
        totalDia: info?.totalDia ?? 0,
      });
      cursor = shiftIsoDate(cursor, 1);
    }
    return dias;
  })();

  const pedidosPorSituacao: SituacaoResumo[] = Array.from(pedidosPorSituacaoMap.entries())
    .map(([situacao, quantidade]) => ({ situacao, descricao: descricaoSituacao(situacao), quantidade }))
    .sort((a, b) => a.situacao - b.situacao);

  const cancelados = pedidosPorSituacaoMap.get(SITUACAO_CANCELADA) ?? 0;
  const ticketMedio = totalPedidos > 0 ? totalValor / totalPedidos : 0;
  const percentualCancelados = totalPedidos > 0 ? (cancelados / totalPedidos) * 100 : 0;

  const periodo: PeriodoResumo = {
    dataInicial: range.start,
    dataFinal: range.end,
    dias: range.dias,
    totalPedidos,
    totalValor,
    totalValorLiquido,
    totalFreteTotal,
    ticketMedio,
    vendasPorDia,
    pedidosPorSituacao,
    totalProdutosVendidos: extras?.totalProdutosVendidos ?? 0,
    percentualCancelados,
    topProdutos: extras?.topProdutos ?? [],
    vendasPorHora: extras?.vendasPorHora ?? [],
  };

  return { periodo, orderFacts };
};

const buildPeriodoResumoFromTinyOrders = async (
  range: { start: string; end: string },
  filtros: {
    canais?: string[] | null;
    situacoesAplicadas: Set<number>;
    situacoesBusca: number[];
    situacoesCancelamento: Set<number>;
  },
  debugCollector?: { included: DebugOrderEntry[]; excluded: DebugOrderEntry[] },
  extras?: Partial<Pick<PeriodoResumo, 'topProdutos' | 'vendasPorHora' | 'totalProdutosVendidos'>>
): Promise<PeriodoComPedidos> => {
  const situacoesBusca = filtros.situacoesBusca;
  const ordersRaw: OrderSummaryRow[] = [];
  let truncated = false;

  for (let page = 0; page < DASHBOARD_FETCH_MAX_PAGES; page += 1) {
    const from = page * DASHBOARD_FETCH_PAGE_SIZE;
    const to = from + DASHBOARD_FETCH_PAGE_SIZE - 1;

    let query = supabaseAdmin
      .from('tiny_orders')
      .select('id,tiny_id,data_criacao,valor_total_pedido,valor,valor_frete,situacao,canal,uf,cidade,raw,inserted_at,updated_at')
      .gte('data_criacao', range.start)
      .lte('data_criacao', range.end)
      .order('data_criacao', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, to);

    if (filtros.canais?.length) {
      query = query.in('canal', filtros.canais);
    }
    if (situacoesBusca.length) {
      query = query.in('situacao', situacoesBusca);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[dashboard-debug] tiny_orders_periodo_error', {
        error,
        range,
        filtros,
        page,
      });
      break;
    }

    const chunk = (data ?? []) as OrderSummaryRow[];
    ordersRaw.push(...chunk);

    if (chunk.length < DASHBOARD_FETCH_PAGE_SIZE) {
      break;
    }
    if (page === DASHBOARD_FETCH_MAX_PAGES - 1) {
      truncated = true;
    }
  }

  if (truncated) {
    console.warn('[dashboard] tiny_orders truncados pelo limite de paginação', {
      range,
      total: ordersRaw.length,
    });
  }

  const included: DebugOrderEntry[] = debugCollector?.included ?? [];
  const excluded: DebugOrderEntry[] = debugCollector?.excluded ?? [];
  const includedOrders: OrderSummaryRow[] = [];

  for (const order of ordersRaw) {
    const situacao = typeof order.situacao === 'number' ? order.situacao : toNumberSafe(order.situacao ?? -1);
    const dataRefIso = getOrderDateForResumo(order).slice(0, 10);
    const baseEntry: DebugOrderEntry = {
      id: typeof order.id === 'number' ? order.id : null,
      tiny_id: typeof (order as any).tiny_id === 'number' ? (order as any).tiny_id : null,
      situacao,
      canal: order.canal ?? null,
      data_criacao: order.data_criacao ?? null,
      dataRefResumo: dataRefIso,
    };

    if (!filtros.situacoesAplicadas.has(situacao)) {
      excluded.push({ ...baseEntry, motivoExclusao: situacao === SITUACAO_CANCELADA ? 'situacaoCancelada(2)' : 'situacaoNaoSelecionada' });
      continue;
    }

    if (dataRefIso < range.start || dataRefIso > range.end) {
      excluded.push({ ...baseEntry, motivoExclusao: 'foraDoIntervaloDataRefResumo' });
      continue;
    }

    included.push({ ...baseEntry, dataRefResumo: dataRefIso });
    includedOrders.push(order);
  }

  const dias = diffDias(new Date(`${range.start}T00:00:00`), new Date(`${range.end}T00:00:00`)) + 1;
  const { periodo, orderFacts } = buildPeriodoResumoFromOrders(
    includedOrders,
    { start: range.start, end: range.end, dias },
    {
      situacoesCancelamento: filtros.situacoesCancelamento,
    },
    extras
  );

  return { periodo, pedidos: includedOrders, orderFacts, debugIncluded: included, debugExcluded: excluded };
};

const computeTopProdutos = (
  produtoFacts: CacheProdutoFact[],
  limite = 12
): ProdutoResumo[] => {
  const produtosMap = aggregateMap(
    produtoFacts,
    (p) => `${p.produto_id}:${p.sku ?? ''}:${p.descricao}`,
    (acc: any, item) => {
      acc.produtoId = Number.isFinite(item.produto_id) ? item.produto_id : null;
      acc.sku = item.sku ?? null;
      acc.descricao = item.descricao;
      acc.quantidade = (acc.quantidade ?? 0) + (item.quantidade ?? 0);
      acc.receita = (acc.receita ?? 0) + (item.receita ?? 0);
      const serieMap: Record<string, { quantidade: number; receita: number }> = acc.serieDiariaMap ?? {};
      const dia = item.data;
      if (dia) {
        const atual = serieMap[dia] ?? { quantidade: 0, receita: 0 };
        atual.quantidade += item.quantidade ?? 0;
        atual.receita += item.receita ?? 0;
        serieMap[dia] = atual;
        acc.serieDiariaMap = serieMap;
      }
    }
  );

  return Array.from(produtosMap.values())
    .sort((a, b) => (b.quantidade ?? 0) - (a.quantidade ?? 0))
    .slice(0, limite)
    .map((p) => ({
      produtoId: p.produtoId,
      sku: p.sku,
      descricao: p.descricao,
      quantidade: p.quantidade ?? 0,
      receita: p.receita ?? 0,
      serieDiaria: p.serieDiariaMap
        ? Object.entries(
          p.serieDiariaMap as Record<string, { quantidade: number; receita: number }>
          )
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([data, info]) => ({ data, quantidade: info.quantidade, receita: info.receita }))
        : undefined,
    }));
};

const enrichTopProdutos = async (produtos: ProdutoResumo[]): Promise<ProdutoResumo[]> => {
  if (!produtos.length) return produtos;

  const ids = Array.from(
    new Set(produtos.map((p) => (typeof p.produtoId === 'number' ? p.produtoId : null)).filter((id): id is number => id !== null))
  );
  const skus = Array.from(
    new Set(produtos.map((p) => (p.sku ? p.sku.trim() : null)).filter((sku): sku is string => !!sku))
  );

  const lookup: Record<
    string,
    {
      imagemUrl: string | null;
      saldo: number | null;
      reservado: number | null;
      disponivel: number | null;
      codigo: string | null;
    }
  > = {};

  if (ids.length) {
    const { data, error } = await supabaseAdmin
      .from('tiny_produtos')
      .select('id_produto_tiny,codigo,imagem_url,saldo,reservado,disponivel')
      .in('id_produto_tiny', ids);
    if (!error && data) {
      for (const row of data) {
        const key = row.id_produto_tiny ? `id:${row.id_produto_tiny}` : null;
        const entry = {
          imagemUrl: row.imagem_url ?? null,
          saldo: row.saldo ?? null,
          reservado: row.reservado ?? null,
          disponivel: row.disponivel ?? null,
          codigo: row.codigo ?? null,
        };
        if (key) {
          lookup[key] = entry;
        }
        if (row.codigo) {
          lookup[`sku:${row.codigo}`] = entry;
        }
      }
    }
  }

  if (!ids.length && skus.length) {
    const { data, error } = await supabaseAdmin
      .from('tiny_produtos')
      .select('id_produto_tiny,codigo,imagem_url,saldo,reservado,disponivel')
      .in('codigo', skus);
    if (!error && data) {
      for (const row of data) {
        if (row.codigo) {
          const entry = {
            imagemUrl: row.imagem_url ?? null,
            saldo: row.saldo ?? null,
            reservado: row.reservado ?? null,
            disponivel: row.disponivel ?? null,
            codigo: row.codigo ?? null,
          };
          lookup[`sku:${row.codigo}`] = entry;
        }
      }
    }
  }

  return produtos.map((p) => {
    const keyId = typeof p.produtoId === 'number' ? `id:${p.produtoId}` : null;
    const keySku = p.sku ? `sku:${p.sku}` : null;
    const found = (keyId && lookup[keyId]) || (keySku && lookup[keySku]) || null;
    if (!found) return p;
    return {
      ...p,
      sku: p.sku ?? found.codigo ?? undefined,
      imagemUrl: p.imagemUrl ?? found.imagemUrl ?? undefined,
      saldo: p.saldo ?? found.saldo ?? null,
      reservado: p.reservado ?? found.reservado ?? null,
      disponivel: p.disponivel ?? found.disponivel ?? null,
    };
  });
};

const computeCanais = (orders: CacheOrderFact[]): CanalResumo[] => {
  const canaisMap = aggregateMap(
    orders,
    (o) => o.canal ?? 'Outros',
    (acc: any, item) => {
      acc.canal = item.canal ?? 'Outros';
      acc.totalValor = (acc.totalValor ?? 0) + (item.valor_bruto ?? 0);
      acc.totalPedidos = (acc.totalPedidos ?? 0) + (item.pedidos ?? 0);
    }
  );
  return Array.from(canaisMap.values()).sort((a, b) => (b.totalValor ?? 0) - (a.totalValor ?? 0));
};

const computeMapaUF = (orders: CacheOrderFact[]) => {
  const mapa = aggregateMap(
    orders,
    (o) => o.uf ?? 'ND',
    (acc: any, item) => {
      acc.uf = item.uf ?? 'ND';
      acc.totalValor = (acc.totalValor ?? 0) + (item.valor_bruto ?? 0);
      acc.totalPedidos = (acc.totalPedidos ?? 0) + (item.pedidos ?? 0);
    }
  );
  return Array.from(mapa.values()).filter((m) => m.uf && m.uf !== 'ND');
};

const computeMapaCidade = (orders: CacheOrderFact[]) => {
  const mapa = aggregateMap(
    orders,
    (o) => `${o.cidade ?? 'nd'}|${o.uf ?? ''}`,
    (acc: any, item) => {
      acc.cidade = item.cidade ?? 'ND';
      acc.uf = item.uf ?? null;
      acc.totalValor = (acc.totalValor ?? 0) + (item.valor_bruto ?? 0);
      acc.totalPedidos = (acc.totalPedidos ?? 0) + (item.pedidos ?? 0);
    }
  );
  return Array.from(mapa.values()).filter((m) => m.cidade && m.cidade !== 'ND');
};

const buildDiff = (currentValue: number, previousValue: number): MetricDiff => {
  const current = Number.isFinite(currentValue) ? Number(currentValue) : 0;
  const previous = Number.isFinite(previousValue) ? Number(previousValue) : 0;
  const delta = current - previous;
  const deltaPercent = previous > 0 ? (delta / previous) * 100 : null;
  return { current, previous, delta, deltaPercent };
};

const computeDiffs = (current: PeriodoResumo, previous: PeriodoResumo): DashboardDiffs => {
  const faturamento = buildDiff(current.totalValor, previous.totalValor);
  const pedidos = buildDiff(current.totalPedidos, previous.totalPedidos);
  const ticket = buildDiff(current.ticketMedio, previous.ticketMedio);

  return {
    faturamento,
    pedidos,
    ticketMedio: ticket,
    // campos legados para compatibilidade
    faturamentoDelta: faturamento.delta,
    faturamentoDeltaPercent: faturamento.deltaPercent,
    faturamentoHasComparison: faturamento.previous > 0,
    pedidosDelta: pedidos.delta,
    pedidosDeltaPercent: pedidos.deltaPercent,
    pedidosHasComparison: pedidos.previous > 0,
    ticketMedioDelta: ticket.delta,
    ticketMedioDeltaPercent: ticket.deltaPercent,
    ticketMedioHasComparison: ticket.previous > 0,
  };
};

type DateRange = {
  start: string; // inclusive
  endExclusive: string; // exclusive
  displayEnd: string; // inclusivo para exibição
  days: number;
};

type BuildRangesResult = {
  current: DateRange;
  previous: DateRange;
  meta: { incluiHoje: boolean; horaCorteMinutos: number | null };
};

type DiaAggregado = {
  data: string;
  pedidos: number;
  faturamento: number;
  frete: number;
};

const buildAlignedRanges = (params: {
  dataInicialParam: string | null;
  dataFinalParam: string | null;
  diasParam: string | null;
  timeZone?: string;
  now?: Date;
  aplicarCutoff?: boolean;
}): BuildRangesResult => {
  const timeZone = params.timeZone ?? DEFAULT_REPORT_TIMEZONE;
  const now = params.now ?? new Date();
  const aplicarCutoff = params.aplicarCutoff ?? true;
  const hojeLabel = formatDateInTimeZone(now, timeZone);
  const requestedEnd = params.dataFinalParam ?? hojeLabel;
  const incluiHoje = requestedEnd >= hojeLabel;

  const dataInicialStr = (() => {
    if (params.dataInicialParam) return params.dataInicialParam;
    const dias = params.diasParam ? Number(params.diasParam) : 30;
    const dur = Number.isFinite(dias) && dias > 0 ? Math.floor(dias) : 30;
    const provisionalEnd = incluiHoje ? hojeLabel : requestedEnd;
    return shiftIsoDate(provisionalEnd, -1 * (dur - 1));
  })();

  const isMonthSpan =
    params.dataInicialParam &&
    params.dataFinalParam &&
    isFirstDayOfMonth(params.dataInicialParam) &&
    params.dataInicialParam.slice(0, 7) === params.dataFinalParam.slice(0, 7) &&
    endOfMonthIso(params.dataInicialParam) === params.dataFinalParam;

  if (isMonthSpan) {
    const start = dataInicialStr;
    const requestedMonthEnd = params.dataFinalParam!;
    const displayEnd = incluiHoje ? hojeLabel : requestedMonthEnd;
    const endExclusive = shiftIsoDate(displayEnd, 1);

    const prevStart = startOfPreviousMonthIso(start);
    const prevDisplayEnd = endOfMonthIso(prevStart);
    const prevEndExclusive = shiftIsoDate(prevDisplayEnd, 1);

    const daysCurrent = Math.max(
      1,
      diffDias(new Date(`${start}T00:00:00`), new Date(`${endExclusive}T00:00:00`))
    );
    const daysPrevious = Math.max(
      1,
      diffDias(new Date(`${prevStart}T00:00:00`), new Date(`${prevEndExclusive}T00:00:00`))
    );

    const current: DateRange = {
      start,
      endExclusive,
      displayEnd,
      days: daysCurrent,
    };
    const previous: DateRange = {
      start: prevStart,
      endExclusive: prevEndExclusive,
      displayEnd: prevDisplayEnd,
      days: daysPrevious,
    };
    const horaCorteMinutos = aplicarCutoff && incluiHoje ? getCutoffMinutesNowSp() : null;
    return { current, previous, meta: { incluiHoje, horaCorteMinutos } };
  }

  const endInclusive = requestedEnd >= dataInicialStr ? requestedEnd : dataInicialStr;
  const endExclusive = shiftIsoDate(endInclusive, 1);
  const days = Math.max(1, diffDias(new Date(`${dataInicialStr}T00:00:00`), new Date(`${endExclusive}T00:00:00`)));

  const monthPartialFromStart =
    params.dataInicialParam !== null &&
    isFirstDayOfMonth(params.dataInicialParam) &&
    params.dataInicialParam.slice(0, 7) === (params.dataFinalParam ?? hojeLabel).slice(0, 7) &&
    !isMonthSpan;

  const prevEndExclusive = dataInicialStr;
  const prevStart = monthPartialFromStart ? startOfPreviousMonthIso(dataInicialStr) : shiftIsoDate(prevEndExclusive, -1 * days);

  let prevDisplayEnd: string;
  let prevEndExclusiveAdjusted: string;
  let prevDays: number;

  if (monthPartialFromStart) {
    const prevMonthEnd = endOfMonthIso(prevStart);
    const targetPrevDisplayEnd = shiftIsoDate(prevStart, days - 1);
    const prevDisplayEndClamped = targetPrevDisplayEnd > prevMonthEnd ? prevMonthEnd : targetPrevDisplayEnd;
    prevDisplayEnd = prevDisplayEndClamped;
    prevEndExclusiveAdjusted = shiftIsoDate(prevDisplayEndClamped, 1);
    prevDays = Math.max(1, diffDias(new Date(`${prevStart}T00:00:00`), new Date(`${prevEndExclusiveAdjusted}T00:00:00`)));
  } else {
    prevDisplayEnd = shiftIsoDate(prevEndExclusive, -1);
    prevEndExclusiveAdjusted = prevEndExclusive;
    prevDays = days;
  }

  const current: DateRange = {
    start: dataInicialStr,
    endExclusive,
    displayEnd: endInclusive >= hojeLabel ? hojeLabel : endInclusive,
    days,
  };
  const previous: DateRange = {
    start: prevStart,
    endExclusive: prevEndExclusiveAdjusted,
    displayEnd: prevDisplayEnd,
    days: prevDays,
  };

  const horaCorteMinutos = aplicarCutoff && incluiHoje ? getCutoffMinutesNowSp() : null;

  return { current, previous, meta: { incluiHoje, horaCorteMinutos } };
};

export async function GET(req: NextRequest) {
  const handlerTimer = '[dashboard] handler';
  console.time(handlerTimer);
  try {
    const { searchParams } = new URL(req.url);
    const dataInicialParam = searchParams.get('dataInicial');
    const dataFinalParam = searchParams.get('dataFinal');
    const diasParam = searchParams.get('dias');
    const canaisParam = searchParams.get('canais');
    const situacoesParam = searchParams.get('situacoes');
    const noCutoff = searchParams.get('noCutoff') === '1';
    const microCurrentStartParam = searchParams.get('microCurrentStart');
    const microCurrentEndParam = searchParams.get('microCurrentEnd');
    const microPrevStartParam = searchParams.get('microPrevStart');
    const microPrevEndParam = searchParams.get('microPrevEnd');
    const previousStartParam = searchParams.get('previousStart');
    const previousEndParam = searchParams.get('previousEnd');
    const contextParam = searchParams.get('context') ?? 'dashboard';
    const debugPedidos = searchParams.get('debugPedidos') === '1';
    const agora = new Date();
    const aplicarCutoff = !noCutoff;
    const parseDateParam = (value: string | null): Date | null => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const microtrendOverrides = {
      currentStart: parseDateParam(microCurrentStartParam),
      currentEnd: parseDateParam(microCurrentEndParam),
      previousStart: parseDateParam(microPrevStartParam),
      previousEnd: parseDateParam(microPrevEndParam),
    } satisfies MicroTrendWindowOverride;
    const { current, previous: previousBase, meta } = buildAlignedRanges({
      dataInicialParam,
      dataFinalParam,
      diasParam,
      timeZone: DEFAULT_REPORT_TIMEZONE,
      now: agora,
      aplicarCutoff,
    });

    const parseIsoDate = (value: string | null): string | null => {
      if (!value) return null;
      const match = value.match(/^\d{4}-\d{2}-\d{2}/);
      return match ? match[0] : null;
    };

    const previousStartOverride = parseIsoDate(previousStartParam);
    const previousEndOverride = parseIsoDate(previousEndParam);

    const previous: DateRange = (() => {
      if (!previousStartOverride && !previousEndOverride) return previousBase;
      const start = previousStartOverride ?? previousBase.start;
      const displayEnd = previousEndOverride ?? previousBase.displayEnd;
      const endExclusive = shiftIsoDate(displayEnd, 1);
      const days = Math.max(
        1,
        diffDias(new Date(`${start}T00:00:00`), new Date(`${endExclusive}T00:00:00`))
      );
      return { start, endExclusive, displayEnd, days };
    })();

    const applyHoraCorte = aplicarCutoff && meta.incluiHoje && meta.horaCorteMinutos !== null;
    const horaCorteMinutos = applyHoraCorte ? meta.horaCorteMinutos : null;

    const canaisFiltro = canaisParam ? canaisParam.split(',').filter(Boolean) : null;
    const todasSituacoesCodigos: number[] = TODAS_SITUACOES.map((s) => s.codigo);
    const situacoesParsed = situacoesParam
      ? situacoesParam
          .split(',')
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n))
      : [];

    const situacoesSelecionadas = situacoesParsed.length > 0
      ? situacoesParsed.filter((s) => todasSituacoesCodigos.includes(s))
      : [...todasSituacoesCodigos];

    const situacoesAplicadasSet = new Set(situacoesSelecionadas);
    const situacoesCancelamentoSet = new Set([SITUACAO_CANCELADA]);
    const situacoesFiltro = situacoesSelecionadas;

    const situacoesAplicadasArray = Array.from(situacoesAplicadasSet);
    const cutoffOptsAtual: CutoffOptions | undefined = applyHoraCorte && horaCorteMinutos !== null
      ? {
          cutoffDate: current.displayEnd,
          cutoffMinutes: horaCorteMinutos,
          timeZone: DEFAULT_REPORT_TIMEZONE,
        }
      : undefined;
    const cutoffOptsAnterior: CutoffOptions | undefined = applyHoraCorte && horaCorteMinutos !== null
      ? {
          cutoffDate: previous.displayEnd,
          cutoffMinutes: horaCorteMinutos,
          timeZone: DEFAULT_REPORT_TIMEZONE,
        }
      : undefined;

    const debugResumo = searchParams.get('debugResumo') === '1';

    const filtrosBase = {
      canais: canaisFiltro,
      situacoesAplicadas: situacoesAplicadasSet,
      situacoesBusca: situacoesFiltro,
      situacoesCancelamento: situacoesCancelamentoSet,
    };

    const debugCollector = debugPedidos ? { included: [] as DebugOrderEntry[], excluded: [] as DebugOrderEntry[] } : undefined;

    const [periodoAtualResult, periodoAnteriorResult] = await Promise.all([
      buildPeriodoResumoFromTinyOrders({ start: current.start, end: current.displayEnd }, filtrosBase, debugCollector),
      buildPeriodoResumoFromTinyOrders({ start: previous.start, end: previous.displayEnd }, filtrosBase),
    ]);

    if (debugPedidos && debugCollector) {
      const totalPorSituacao = Array.from(
        debugCollector.included.reduce((map, entry) => {
          const key = entry.situacao;
          const currentAgg = map.get(key) ?? { situacao: key, quantidade: 0 };
          currentAgg.quantidade += 1;
          map.set(key, currentAgg);
          return map;
        }, new Map<number, { situacao: number; quantidade: number }>())
          .values()
      );

      const totalPorCanal = Array.from(
        debugCollector.included.reduce((map, entry) => {
          const key = entry.canal ?? 'Outros';
          const currentAgg = map.get(key) ?? { canal: key, quantidade: 0 };
          currentAgg.quantidade += 1;
          map.set(key, currentAgg);
          return map;
        }, new Map<string, { canal: string; quantidade: number }>())
          .values()
      );

      return NextResponse.json({
        debug: true,
        dataInicial: current.start,
        dataFinal: current.displayEnd,
        filtros: {
          situacoes: situacoesFiltro,
          canais: canaisFiltro,
        },
        included: debugCollector.included,
        excluded: debugCollector.excluded,
        totalPorSituacao,
        totalPorCanal,
        totalPedidosIncluidos: debugCollector.included.length,
        totalPedidosExcluidos: debugCollector.excluded.length,
      });
    }

    const ordersAtualFacts = periodoAtualResult.orderFacts;
    const ordersAnteriorFacts = periodoAnteriorResult.orderFacts;

    const [produtosAtualBaseRaw, produtosAnteriorBaseRaw] = await Promise.all([
      fetchProdutoFactsRange(current.start, current.endExclusive, canaisFiltro, situacoesFiltro),
      fetchProdutoFactsRange(previous.start, previous.endExclusive, canaisFiltro, situacoesFiltro),
    ]);

    const produtosAtuaisFiltrados = filterProdutoRowsWithCutoff(
      produtosAtualBaseRaw,
      current.start,
      current.endExclusive,
      canaisFiltro,
      situacoesFiltro,
      cutoffOptsAtual
    );
    const produtosAnteriorFiltrados = filterProdutoRowsWithCutoff(
      produtosAnteriorBaseRaw,
      previous.start,
      previous.endExclusive,
      canaisFiltro,
      situacoesFiltro,
      cutoffOptsAnterior
    );

    const produtosAtuais = aggregateProdutoFactsFromRows(produtosAtuaisFiltrados);
    const produtosAnterior = aggregateProdutoFactsFromRows(produtosAnteriorFiltrados);

    const produtosAtuaisAplicados = produtosAtuais.filter((p) => situacoesAplicadasSet.has(toNumberSafe(p.situacao ?? -1)));
    const produtosAnteriorAplicados = produtosAnterior.filter((p) => situacoesAplicadasSet.has(toNumberSafe(p.situacao ?? -1)));

    const topAtual = computeTopProdutos(produtosAtuaisAplicados);
    const topAnterior = computeTopProdutos(produtosAnteriorAplicados);

    let periodoAtual = {
      ...periodoAtualResult.periodo,
      totalProdutosVendidos: produtosAtuaisAplicados.reduce((acc, p) => acc + toNumberSafe(p.quantidade ?? 0), 0),
      topProdutos: topAtual,
    };
    let periodoAnterior = {
      ...periodoAnteriorResult.periodo,
      totalProdutosVendidos: produtosAnteriorAplicados.reduce((acc, p) => acc + toNumberSafe(p.quantidade ?? 0), 0),
      topProdutos: topAnterior,
    };

    const vendasPorHoraAtuais = await buildHourlyTrend(DEFAULT_REPORT_TIMEZONE, canaisFiltro, situacoesAplicadasArray);
    periodoAtual = { ...periodoAtual, vendasPorHora: vendasPorHoraAtuais };

    const [topAtualEnriched, topAnteriorEnriched] = await Promise.all([
      enrichTopProdutos(periodoAtual.topProdutos),
      enrichTopProdutos(periodoAnterior.topProdutos),
    ]);
    periodoAtual = { ...periodoAtual, topProdutos: topAtualEnriched };
    periodoAnterior = { ...periodoAnterior, topProdutos: topAnteriorEnriched };

    const canais = computeCanais(ordersAtualFacts);
    const mapaVendasUF = computeMapaUF(ordersAtualFacts);
    const mapaVendasCidade = computeMapaCidade(ordersAtualFacts);
    const canaisDisponiveis = Array.from(new Set([...ordersAtualFacts, ...ordersAnteriorFacts].map((o) => o.canal ?? 'Outros')));

    const diffs = computeDiffs(periodoAtual, periodoAnterior);

    if (debugResumo) {
      return NextResponse.json({
        debugResumo: true,
        dataInicial: current.start,
        dataFinal: current.displayEnd,
        totalPedidos: periodoAtual.totalPedidos,
        totalValor: periodoAtual.totalValor,
        totalValorLiquido: periodoAtual.totalValorLiquido,
        totalFreteTotal: periodoAtual.totalFreteTotal,
        ticketMedio: periodoAtual.ticketMedio,
        vendasPorDia: periodoAtual.vendasPorDia,
        pedidosPorSituacao: periodoAtual.pedidosPorSituacao,
        meta: {
          ordersLength: periodoAtualResult.pedidos.length,
        },
      });
    }

    const microTrend24h = await buildMicroTrend24h(
      DEFAULT_REPORT_TIMEZONE,
      canaisFiltro,
      situacoesAplicadasArray,
      microtrendOverrides
    );

    const lastUpdatedAt = new Date().toISOString();

    const horaLabel = horaCorteMinutos !== null
      ? `${String(Math.floor(horaCorteMinutos / 60)).padStart(2, '0')}:${String(horaCorteMinutos % 60).padStart(2, '0')}`
      : null;

    console.log('[dashboard-debug] cards_hoje', {
      aplicarCutoff: applyHoraCorte,
      horaCorteMinutos,
      context: contextParam,
      current: {
        start: current.start,
        end: applyHoraCorte && horaLabel ? `${current.displayEnd}T${horaLabel}` : current.displayEnd,
      },
      previous: {
        start: previous.start,
        end: applyHoraCorte && horaLabel ? `${previous.displayEnd}T${horaLabel}` : previous.displayEnd,
      },
    });

    if (noCutoff) {
      console.log('[dashboard-debug] ultimos_dias', {
        noCutoff,
        horaCorteMinutos,
        context: contextParam,
        periodo: { start: current.start, end: current.displayEnd },
        vendasPorDia: periodoAtual.vendasPorDia,
      });

      console.log('[dashboard-debug] grafico_diario', {
        noCutoff,
        horaCorteMinutos,
        context: contextParam,
        periodo: { start: current.start, end: current.displayEnd },
        vendasPorDia: periodoAtual.vendasPorDia,
      });
    }

    const debugDate = '2025-12-07';
    const sumPedidosDia = (facts: CacheOrderFact[], dia: string) =>
      facts
        .filter((f) => f.data === dia)
        .reduce((acc, f) => acc + toNumberSafe(f.pedidos ?? 0), 0);
    const detalhePedidosDia = (facts: CacheOrderFact[], dia: string) =>
      facts
        .filter((f) => f.data === dia)
        .map((f) => ({ canal: f.canal, situacao: f.situacao, pedidos: toNumberSafe(f.pedidos ?? 0) }))
        .slice(0, 50);

    console.log('[dashboard-debug] ultimos_dias_raw', {
      date: debugDate,
      applyHoraCorte,
      horaCorteMinutos,
      canaisFiltro,
      situacoesFiltro,
      pedidosAtual: sumPedidosDia(ordersAtualFacts, debugDate),
      pedidosAnterior: sumPedidosDia(ordersAnteriorFacts, debugDate),
      detalheAtual: detalhePedidosDia(ordersAtualFacts, debugDate),
    });

    console.log('[dashboard-debug] ultimos_dias_vs_sql', {
      filtros: {
        canais: canaisFiltro,
        situacoes: situacoesFiltro,
        periodo: { inicio: current.start, fim: current.displayEnd },
        noCutoff,
      },
      apiUltimosDias: periodoAtual.vendasPorDia,
      dia_critico: debugDate,
    });

    if (applyHoraCorte && horaCorteMinutos !== null) {
      const horaLabel = `${String(Math.floor(horaCorteMinutos / 60)).padStart(2, '0')}:${String(horaCorteMinutos % 60).padStart(2, '0')}`;
      console.log('[dashboard] janelas finais', {
        currentStart: current.start,
        currentEnd: `${current.displayEnd}T${horaLabel}`,
        currentPedidos: periodoAtual.totalPedidos,
        currentFaturamento: periodoAtual.totalValor,
        previousStart: previous.start,
        previousEnd: `${previous.displayEnd}T${horaLabel}`,
        previousPedidos: periodoAnterior.totalPedidos,
        previousFaturamento: periodoAnterior.totalValor,
        faturamentoDelta: diffs.faturamento.delta,
        faturamentoDeltaPercent: diffs.faturamento.deltaPercent,
      });
    } else {
      console.log('[dashboard] janelas finais (sem corte de horário)', {
        currentStart: current.start,
        currentEnd: current.displayEnd,
        currentPedidos: periodoAtual.totalPedidos,
        currentFaturamento: periodoAtual.totalValor,
        previousStart: previous.start,
        previousEnd: previous.displayEnd,
        previousPedidos: periodoAnterior.totalPedidos,
        previousFaturamento: periodoAnterior.totalValor,
      });
    }

    const resposta: DashboardResposta = {
      current: periodoAtual,
      previous: periodoAnterior,
      diffs,
      // aliases legados para manter compatibilidade com o cliente
      periodoAtual,
      periodoAnterior,
      periodoAnteriorCards: periodoAnterior,
      microTrend24h,
      canais,
      canaisDisponiveis,
      situacoesDisponiveis: [...TODAS_SITUACOES],
      mapaVendasUF,
      mapaVendasCidade,
      lastUpdatedAt,
    };

    return NextResponse.json(resposta);
  } catch (error) {
    console.error('[dashboard] Erro em /api/tiny/dashboard/resumo', error);
    return NextResponse.json(
      {
        message: 'Erro ao montar resumo do dashboard',
        details: getErrorMessage(error) ?? 'Erro desconhecido',
      },
      { status: 500 }
    );
  } finally {
    console.timeEnd(handlerTimer);
  }
}
