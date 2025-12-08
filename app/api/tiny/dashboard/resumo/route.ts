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
const SUPABASE_MAX_RETRIES = 3;
const NETWORKISH_ERROR = /(fetch failed|Failed to fetch|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network request failed)/i;
const CANCELAMENTO_SITUACOES = new Set([8, 9]);
const DEFAULT_REPORT_TIMEZONE = 'America/Sao_Paulo';

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
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(base);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');

  // Offset (em minutos) entre UTC e o horário local na data base
  const utcFromParts = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
  const baseUtc = Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate(),
    base.getUTCHours(),
    base.getUTCMinutes(),
    base.getUTCSeconds()
  );
  const offsetMinutes = (baseUtc - utcFromParts) / 60000;

  // Meia-noite local convertida para instante UTC correto
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), 0, 0, 0) - offsetMinutes * 60 * 1000);
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

type OrderRowForRange = {
  data_criacao: string | null;
  canal: string | null;
  situacao: number | null;
  cidade: string | null;
  uf: string | null;
  valor: number | null;
  valor_frete: number | null;
  inserted_at: string | null;
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

type DashboardCacheRow = {
  periodo_inicio: string;
  periodo_fim: string;
  order_facts: CacheOrderFact[] | null;
  produto_facts: CacheProdutoFact[] | null;
  last_refreshed_at: string | null;
  total_pedidos: number | null;
  total_valor: number | null;
  total_valor_liquido: number | null;
  total_frete_total: number | null;
  total_produtos_vendidos: number | null;
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

const filterOrders = (
  facts: CacheOrderFact[],
  inicio: string,
  fimExclusive: string,
  canaisFiltro: string[] | null,
  situacoesFiltro: number[] | null,
  opts?: CutoffOptions
) =>
  facts.filter((f) => {
    if (!withinRange(f.data, inicio, fimExclusive)) return false;
    if (canaisFiltro?.length && (f.canal ? !canaisFiltro.includes(f.canal) : true)) return false;
    if (situacoesFiltro?.length && !situacoesFiltro.includes(toNumberSafe(f.situacao ?? -1))) return false;

    if (opts?.cutoffDate && opts.cutoffMinutes !== null && opts.cutoffMinutes !== undefined) {
      const dataStr = f.data ?? '';
      if (dataStr.slice(0, 10) === opts.cutoffDate) {
        const minutes = minutesOfDayInTimeZone(dataStr, opts.timeZone ?? DEFAULT_REPORT_TIMEZONE);
        if (minutes !== null && minutes > opts.cutoffMinutes) return false;
      }
    }

    return true;
  });

const filterProdutos = (
  facts: CacheProdutoFact[],
  inicio: string,
  fimExclusive: string,
  canaisFiltro: string[] | null,
  situacoesFiltro: number[] | null,
  opts?: CutoffOptions
) =>
  facts.filter((f) => {
    if (!withinRange(f.data, inicio, fimExclusive)) return false;
    if (canaisFiltro?.length && (f.canal ? !canaisFiltro.includes(f.canal) : true)) return false;
    if (situacoesFiltro?.length && !situacoesFiltro.includes(Number(f.situacao ?? -1))) return false;

    if (opts?.cutoffDate && opts.cutoffMinutes !== null && opts.cutoffMinutes !== undefined) {
      const dataStr = f.data ?? '';
      if (dataStr.slice(0, 10) === opts.cutoffDate) {
        const minutes = minutesOfDayInTimeZone(dataStr, opts.timeZone ?? DEFAULT_REPORT_TIMEZONE);
        if (minutes !== null && minutes > opts.cutoffMinutes) return false;
      }
    }

    return true;
  });

const filterOrderRowsWithCutoff = (
  rows: OrderRowForRange[],
  inicio: string,
  fimExclusive: string,
  canaisFiltro: string[] | null,
  situacoesFiltro: number[] | null,
  opts?: CutoffOptions
) =>
  rows.filter((row) => {
    const dataStr = row.data_criacao ?? '';
    if (!withinRange(dataStr, inicio, fimExclusive)) return false;

    if (canaisFiltro?.length && (row.canal ? !canaisFiltro.includes(row.canal) : true)) return false;

    const situacao = typeof row.situacao === 'number' ? row.situacao : toNumberSafe(row.situacao ?? -1);
    if (situacoesFiltro?.length && !situacoesFiltro.includes(situacao)) return false;

    if (opts?.cutoffDate && opts.cutoffMinutes !== null && opts.cutoffMinutes !== undefined) {
      if (dataStr.slice(0, 10) === opts.cutoffDate) {
        const minutes = minutesOfDayInTimeZone(
          row.inserted_at ?? dataStr,
          opts.timeZone ?? DEFAULT_REPORT_TIMEZONE
        );
        if (minutes !== null && minutes > opts.cutoffMinutes) return false;
      }
    }

    return true;
  });

const aggregateOrdersFromRows = (rows: OrderRowForRange[]): CacheOrderFact[] => {
  const orderFactsMap = aggregateMap(
    rows,
    (item) => `${item.data_criacao ?? ''}|${item.canal ?? 'Outros'}|${item.situacao ?? -1}|${item.cidade ?? ''}|${item.uf ?? ''}`,
    (acc: any, item) => {
      const valorBruto = toNumberSafe(item.valor ?? 0);
      const valorFrete = toNumberSafe(item.valor_frete ?? 0);
      acc.data = item.data_criacao ?? null;
      acc.canal = item.canal ?? 'Outros';
      acc.situacao = typeof item.situacao === 'number' ? item.situacao : toNumberSafe(item.situacao ?? -1);
      acc.cidade = item.cidade ?? null;
      acc.uf = item.uf ?? null;
      acc.pedidos = (acc.pedidos ?? 0) + 1;
      acc.valor_bruto = (acc.valor_bruto ?? 0) + valorBruto;
      acc.valor_frete = (acc.valor_frete ?? 0) + valorFrete;
      acc.valor_liquido = (acc.valor_liquido ?? 0) + (valorBruto - valorFrete);
    }
  );

  return Array.from(orderFactsMap.values()).filter((f) => !!f.data);
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
  const query = supabaseAdmin
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
    .limit(SUPABASE_MAX_ROWS);

  if (canaisFiltro?.length) {
    query.in('tiny_orders.canal', canaisFiltro);
  }
  if (situacoesFiltro?.length) {
    query.in('tiny_orders.situacao', situacoesFiltro);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[dashboard] falha ao buscar itens para top produtos', error);
    return [];
  }

  return (data ?? []).map((item) => {
    const pedido = (item as any).tiny_orders ?? {};
    return {
      id_pedido: item.id_pedido as number,
      id_produto_tiny: (item as any).id_produto_tiny ?? null,
      codigo_produto: (item as any).codigo_produto ?? null,
      nome_produto: (item as any).nome_produto ?? null,
      quantidade: (item as any).quantidade ?? null,
      valor_total: (item as any).valor_total ?? null,
      valor_unitario: (item as any).valor_unitario ?? null,
      tiny_orders: {
        data_criacao: pedido.data_criacao ?? null,
        canal: pedido.canal ?? null,
        situacao: typeof pedido.situacao === 'number' ? pedido.situacao : toNumberSafe(pedido.situacao ?? -1),
        inserted_at: pedido.inserted_at ?? null,
      },
    } satisfies ProdutoItemRowForRange;
  });
};

const fetchOrderFactsRange = async (
  dataInicialStr: string,
  dataFinalExclusive: string,
  canaisFiltro: string[] | null,
  situacoesFiltro: number[] | null
): Promise<OrderRowForRange[]> => {
  const query = supabaseAdmin
    .from('tiny_orders')
    .select('data_criacao,canal,situacao,cidade,uf,valor,valor_frete,inserted_at')
    .gte('data_criacao', dataInicialStr)
    .lt('data_criacao', dataFinalExclusive)
    .limit(SUPABASE_MAX_ROWS);

  if (canaisFiltro?.length) {
    query.in('canal', canaisFiltro);
  }
  if (situacoesFiltro?.length) {
    query.in('situacao', situacoesFiltro);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[dashboard] falha ao carregar pedidos para comparação', error);
    return [];
  }

  return (data ?? []) as OrderRowForRange[];
};

const buildFactsOnTheFly = async (
  dataInicialStr: string,
  dataFinalExclusive: string
): Promise<DashboardCacheRow | null> => {
  const { data: orders, error: ordersErr } = await supabaseAdmin
    .from('tiny_orders')
    .select('id,data_criacao,canal,situacao,cidade,uf,valor,valor_frete')
    .gte('data_criacao', dataInicialStr)
    .lt('data_criacao', dataFinalExclusive);

  if (ordersErr) {
    console.error('[dashboard] falha ao carregar pedidos on-the-fly', ordersErr);
    return null;
  }

  const orderFactsMap = aggregateMap(
    orders ?? [],
    (o) => `${o.data_criacao ?? ''}|${o.canal ?? 'Outros'}|${o.situacao ?? -1}|${o.cidade ?? ''}|${o.uf ?? ''}`,
    (acc: any, item) => {
      const valorBruto = toNumberSafe(item.valor ?? 0);
      const valorFrete = toNumberSafe(item.valor_frete ?? 0);
      acc.data = item.data_criacao ?? null;
      acc.canal = item.canal ?? 'Outros';
      acc.situacao = typeof item.situacao === 'number' ? item.situacao : toNumberSafe(item.situacao ?? -1);
      acc.cidade = item.cidade ?? null;
      acc.uf = item.uf ?? null;
      acc.pedidos = (acc.pedidos ?? 0) + 1;
      acc.valor_bruto = (acc.valor_bruto ?? 0) + valorBruto;
      acc.valor_frete = (acc.valor_frete ?? 0) + valorFrete;
      acc.valor_liquido = (acc.valor_liquido ?? 0) + (valorBruto - valorFrete);
    }
  );

  const orderFacts: CacheOrderFact[] = Array.from(orderFactsMap.values()).filter((f) => !!f.data);

  const { data: itens, error: itensErr } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select(
      'id_pedido,id_produto_tiny,codigo_produto,nome_produto,quantidade,valor_total,valor_unitario,tiny_orders!inner(data_criacao,canal,situacao)'
    )
    .gte('tiny_orders.data_criacao', dataInicialStr)
    .lt('tiny_orders.data_criacao', dataFinalExclusive);

  if (itensErr) {
    console.error('[dashboard] falha ao carregar itens on-the-fly', itensErr);
  }

  const produtoFactsMap = aggregateMap(
    itens ?? [],
    (item) => {
      const pedido = (item as any).tiny_orders ?? {};
      return `${pedido.data_criacao ?? ''}|${pedido.canal ?? 'Outros'}|${pedido.situacao ?? -1}|${item.id_produto_tiny ?? 0}|${item.codigo_produto ?? ''}`;
    },
    (acc: any, item) => {
      const pedido = (item as any).tiny_orders ?? {};
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

    const produtoFacts: CacheProdutoFact[] = Array.from(produtoFactsMap.values()).filter((f) => !!f.data);

  return {
    periodo_inicio: dataInicialStr,
    periodo_fim: shiftIsoDate(dataFinalExclusive, -1),
    order_facts: orderFacts,
    produto_facts: produtoFacts,
    last_refreshed_at: new Date().toISOString(),
    total_pedidos: orderFacts.reduce((acc, f) => acc + toNumberSafe(f.pedidos), 0),
    total_valor: orderFacts.reduce((acc, f) => acc + toNumberSafe(f.valor_bruto), 0),
    total_valor_liquido: orderFacts.reduce((acc, f) => acc + toNumberSafe(f.valor_liquido), 0),
    total_frete_total: orderFacts.reduce((acc, f) => acc + toNumberSafe(f.valor_frete), 0),
    total_produtos_vendidos: produtoFacts.reduce((acc, f) => acc + toNumberSafe(f.quantidade), 0),
  };
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

const buildHourlyTrend = async (timeZone: string): Promise<HoraTrend[]> => {
  const todayLabel = formatDateInTimeZone(new Date(), timeZone);
  const yesterdayLabel = shiftIsoDate(todayLabel, -1);
  const rangeStart = new Date(Date.now() - HOURLY_TREND_LOOKBACK_MS);
  const rangeEnd = new Date();
  const cutoffMinutes = getCutoffMinutesNowSp();
  try {
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('valor,inserted_at,updated_at')
      .gte('inserted_at', rangeStart.toISOString())
      .lte('inserted_at', rangeEnd.toISOString());
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

const buildMicroTrend24h = async (
  timeZone: string,
  canaisFiltro: string[] | null,
  situacoesFiltro: number[] | null
): Promise<MicroTrend24h> => {
  const agoraSp = nowInTimeZone(timeZone);
  const hojeLabel = formatDateInTimeZone(agoraSp, timeZone);
  const ontemLabel = shiftIsoDate(hojeLabel, -1);
  const minutesNow = minutesOfDayInTimeZone(new Date().toISOString(), timeZone);
  const cutoffHour = minutesNow === null ? 23 : Math.min(23, Math.max(0, Math.floor(minutesNow / 60)));
  const hojeStart = startOfDayInTimeZone(agoraSp, timeZone);
  const hojeEnd = new Date(hojeStart.getTime() + DAY_MS - 1000);
  const ontemStart = startOfDayInTimeZone(new Date(hojeStart.getTime() - DAY_MS), timeZone);
  const ontemEnd = new Date(ontemStart.getTime() + DAY_MS - 1000);

  let query = supabaseAdmin
    .from('tiny_orders')
    .select('valor,inserted_at,canal,situacao')
    .gte('inserted_at', ontemStart.toISOString())
    .lte('inserted_at', hojeEnd.toISOString())
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

  const hoursCount = 24;
  const currentBuckets = Array.from({ length: hoursCount }, () => ({ valor: 0, pedidos: 0 }));
  const previousBuckets = Array.from({ length: hoursCount }, () => ({ valor: 0, pedidos: 0 }));

  for (const row of data ?? []) {
    const ts = new Date((row as any).inserted_at ?? null);
    if (Number.isNaN(ts.getTime())) continue;
    const dayLabel = formatDateInTimeZone(ts, timeZone);
    const minutes = minutesOfDayInTimeZone(ts.toISOString(), timeZone);
    if (minutes === null) continue;

    const idx = Math.floor(minutes / 60);
    if (idx < 0 || idx >= hoursCount) continue;

    if (dayLabel === hojeLabel) {
      currentBuckets[idx].valor += toNumberSafe((row as any).valor ?? 0);
      currentBuckets[idx].pedidos += 1;
    } else if (dayLabel === ontemLabel) {
      previousBuckets[idx].valor += toNumberSafe((row as any).valor ?? 0);
      previousBuckets[idx].pedidos += 1;
    }
  }

  const buildSeries = (
    buckets: Array<{ valor: number; pedidos: number }>,
    isCurrent: boolean
  ): MicroTrendHora[] =>
    buckets.map((bucket, idx) => ({
      horaIndex: idx,
      faturamento: isCurrent && idx > cutoffHour ? null : bucket.valor,
      pedidos: isCurrent && idx > cutoffHour ? null : bucket.pedidos,
    }));

  const currentSeries = buildSeries(currentBuckets, true);
  const previousSeries = buildSeries(previousBuckets, false);

  const microTrend24h: MicroTrend24h = {
    currentWindow: {
      start: hojeStart.toISOString(),
      end: hojeEnd.toISOString(),
      seriesPorHora: currentSeries,
    },
    previousWindow: {
      start: ontemStart.toISOString(),
      end: ontemEnd.toISOString(),
      seriesPorHora: previousSeries,
    },
  };

  console.log('[dashboard] microTrend24h-dia', {
    current: microTrend24h.currentWindow,
    previous: microTrend24h.previousWindow,
  });

  return microTrend24h;
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

const computePeriodoResumo = (
  orders: CacheOrderFact[],
  produtos: CacheProdutoFact[],
  dataInicialStr: string,
  dataFinalStr: string
): PeriodoResumo => {
  const vendasPorDiaMap = aggregateMap(
    orders,
    (o) => o.data,
    (acc: any, item) => {
      acc.data = item.data;
      acc.quantidade = (acc.quantidade ?? 0) + toNumberSafe(item.pedidos ?? 0);
      acc.totalDia = (acc.totalDia ?? 0) + toNumberSafe(item.valor_bruto ?? 0);
    }
  );

  const pedidosPorSituacaoMap = aggregateMap(
    orders,
    (o) => toNumberSafe(o.situacao ?? -1),
    (acc: any, item) => {
      acc.situacao = toNumberSafe(item.situacao ?? -1);
      acc.descricao = descricaoSituacao(acc.situacao);
      acc.quantidade = (acc.quantidade ?? 0) + toNumberSafe(item.pedidos ?? 0);
    }
  );

  const totalPedidos = orders.reduce((acc, o) => acc + toNumberSafe(o.pedidos ?? 0), 0);
  const totalValor = orders.reduce((acc, o) => acc + toNumberSafe(o.valor_bruto ?? 0), 0);
  const totalFrete = orders.reduce((acc, o) => acc + toNumberSafe(o.valor_frete ?? 0), 0);
  const totalProdutosVendidos = produtos.reduce((acc, p) => acc + toNumberSafe(p.quantidade ?? 0), 0);
  const cancelamentoBase = orders.reduce((acc, o) => acc + toNumberSafe(o.pedidos ?? 0), 0);
  const cancelados = orders.reduce(
    (acc, o) =>
      CANCELAMENTO_SITUACOES.has(toNumberSafe(o.situacao ?? -1))
        ? acc + toNumberSafe(o.pedidos ?? 0)
        : acc,
    0
  );

  const topProdutos = computeTopProdutos(produtos);

  return {
    dataInicial: dataInicialStr,
    dataFinal: dataFinalStr,
    dias: diffDias(new Date(`${dataInicialStr}T00:00:00`), new Date(`${dataFinalStr}T00:00:00`)) + 1,
    totalPedidos,
    totalValor,
    totalValorLiquido: Math.max(0, totalValor - totalFrete),
    totalFreteTotal: totalFrete,
    ticketMedio: totalPedidos > 0 ? totalValor / totalPedidos : 0,
    vendasPorDia: Array.from(vendasPorDiaMap.values()).sort((a, b) => (a.data < b.data ? -1 : 1)),
    pedidosPorSituacao: Array.from(pedidosPorSituacaoMap.values()),
    totalProdutosVendidos,
    percentualCancelados: cancelamentoBase > 0 ? (cancelados / cancelamentoBase) * 100 : 0,
    topProdutos,
    vendasPorHora: [],
  };
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

const loadCacheRow = async (dataInicialStr: string, dataFinalStr: string): Promise<DashboardCacheRow | null> => {
  const { data, error } = await supabaseAdmin
    .from('dashboard_resumo_cache')
    .select(
      'periodo_inicio,periodo_fim,order_facts,produto_facts,last_refreshed_at,total_pedidos,total_valor,total_valor_liquido,total_frete_total,total_produtos_vendidos'
    )
    .lte('periodo_inicio', dataInicialStr)
    .gte('periodo_fim', dataFinalStr)
    .order('periodo_fim', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[dashboard] erro ao buscar cache', error);
    return null;
  }
  if (!data?.length) return null;
  return data[0] as DashboardCacheRow;
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

const buildAlignedRanges = (params: {
  dataInicialParam: string | null;
  dataFinalParam: string | null;
  diasParam: string | null;
  timeZone?: string;
  now?: Date;
}): BuildRangesResult => {
  const timeZone = params.timeZone ?? DEFAULT_REPORT_TIMEZONE;
  const now = params.now ?? new Date();
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
    const horaCorteMinutos = incluiHoje ? getCutoffMinutesNowSp() : null;
    return { current, previous, meta: { incluiHoje, horaCorteMinutos } };
  }

  const endInclusive = requestedEnd >= dataInicialStr ? requestedEnd : dataInicialStr;
  const endExclusive = shiftIsoDate(endInclusive, 1);
  const days = Math.max(1, diffDias(new Date(`${dataInicialStr}T00:00:00`), new Date(`${endExclusive}T00:00:00`)));

  const prevEndExclusive = dataInicialStr;
  const prevStart = shiftIsoDate(prevEndExclusive, -1 * days);

  const current: DateRange = {
    start: dataInicialStr,
    endExclusive,
    displayEnd: endInclusive >= hojeLabel ? hojeLabel : endInclusive,
    days,
  };
  const previous: DateRange = {
    start: prevStart,
    endExclusive: prevEndExclusive,
    displayEnd: shiftIsoDate(prevEndExclusive, -1),
    days,
  };

  const horaCorteMinutos = incluiHoje ? getCutoffMinutesNowSp() : null;

  return { current, previous, meta: { incluiHoje, horaCorteMinutos } };
};

export async function GET(req: NextRequest) {
  const handlerTimer = '[dashboard] handler';
  const supabaseTimer = '[dashboard] supabase_query';
  console.time(handlerTimer);
  try {
    const { searchParams } = new URL(req.url);
    const dataInicialParam = searchParams.get('dataInicial');
    const dataFinalParam = searchParams.get('dataFinal');
    const diasParam = searchParams.get('dias');
    const canaisParam = searchParams.get('canais');
    const situacoesParam = searchParams.get('situacoes');
    const noCutoff = searchParams.get('noCutoff') === '1';
    const agora = new Date();
    const { current, previous, meta } = buildAlignedRanges({
      dataInicialParam,
      dataFinalParam,
      diasParam,
      timeZone: DEFAULT_REPORT_TIMEZONE,
      now: agora,
    });

  const applyHoraCorte = !noCutoff && meta.incluiHoje && meta.horaCorteMinutos !== null;
    const horaCorteMinutos = meta.horaCorteMinutos;

    const canaisFiltro = canaisParam ? canaisParam.split(',').filter(Boolean) : null;
    const situacoesFiltro = situacoesParam
      ? situacoesParam
          .split(',')
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n))
      : null;

    const shouldUseCache = !applyHoraCorte;
    let cacheRow: DashboardCacheRow | null = null;
    let orderFacts: CacheOrderFact[] = [];
    let produtoFacts: CacheProdutoFact[] = [];
    let ordersAtual: CacheOrderFact[] = [];
    let produtosAtuais: CacheProdutoFact[] = [];
    let ordersAnterior: CacheOrderFact[] = [];
    let produtosAnterior: CacheProdutoFact[] = [];

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

    if (shouldUseCache) {
      console.time(supabaseTimer);
      const refreshInterval = Math.max(365, current.days);
      cacheRow = await loadCacheRow(current.start, current.displayEnd);
      if (!cacheRow) {
        const { error: refreshError } = await supabaseAdmin.rpc(
          'refresh_dashboard_resumo_cache',
          { interval_days: refreshInterval }
        );
        if (refreshError) {
          console.error('[dashboard] erro ao recalcular cache', refreshError);
        }
        cacheRow = await loadCacheRow(current.start, current.displayEnd);
      }
      console.timeEnd(supabaseTimer);

      if (!cacheRow) {
        cacheRow = await buildFactsOnTheFly(current.start, current.endExclusive);
      }

      if (!cacheRow) {
        return NextResponse.json({ message: 'Cache de dashboard indisponível ou vazio após recalculo' }, { status: 503 });
      }

      orderFacts = Array.isArray(cacheRow.order_facts) ? cacheRow.order_facts : [];
      produtoFacts = Array.isArray(cacheRow.produto_facts) ? cacheRow.produto_facts : [];
    } else {
      const [ordersAtualBaseRaw, ordersAnteriorBaseRaw] = await Promise.all([
        fetchOrderFactsRange(current.start, current.endExclusive, canaisFiltro, situacoesFiltro),
        fetchOrderFactsRange(previous.start, previous.endExclusive, canaisFiltro, situacoesFiltro),
      ]);

      const [produtosAtualBaseRaw, produtosAnteriorBaseRaw] = await Promise.all([
        fetchProdutoFactsRange(current.start, current.endExclusive, canaisFiltro, situacoesFiltro),
        fetchProdutoFactsRange(previous.start, previous.endExclusive, canaisFiltro, situacoesFiltro),
      ]);

      const ordersAtualFiltrados = filterOrderRowsWithCutoff(
        ordersAtualBaseRaw,
        current.start,
        current.endExclusive,
        canaisFiltro,
        situacoesFiltro,
        cutoffOptsAtual
      );
      const ordersAnteriorFiltrados = filterOrderRowsWithCutoff(
        ordersAnteriorBaseRaw,
        previous.start,
        previous.endExclusive,
        canaisFiltro,
        situacoesFiltro,
        cutoffOptsAnterior
      );

      ordersAtual = aggregateOrdersFromRows(ordersAtualFiltrados);
      ordersAnterior = aggregateOrdersFromRows(ordersAnteriorFiltrados);

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

      produtosAtuais = aggregateProdutoFactsFromRows(produtosAtuaisFiltrados);
      produtosAnterior = aggregateProdutoFactsFromRows(produtosAnteriorFiltrados);

      orderFacts = [...ordersAtual, ...ordersAnterior];
      produtoFacts = [...produtosAtuais, ...produtosAnterior];
    }

    if (shouldUseCache) {
      ordersAtual = filterOrders(
        orderFacts,
        current.start,
        current.endExclusive,
        canaisFiltro,
        situacoesFiltro,
        cutoffOptsAtual
      );
      produtosAtuais = filterProdutos(
        produtoFacts,
        current.start,
        current.endExclusive,
        canaisFiltro,
        situacoesFiltro,
        cutoffOptsAtual
      );
      if (!produtosAtuais.length && ordersAtual.length) {
        const fetched = await fetchProdutoFactsRange(current.start, current.endExclusive, canaisFiltro, situacoesFiltro);
        const produtosFiltrados = filterProdutoRowsWithCutoff(
          fetched,
          current.start,
          current.endExclusive,
          canaisFiltro,
          situacoesFiltro,
          cutoffOptsAtual
        );
        produtosAtuais = aggregateProdutoFactsFromRows(produtosFiltrados);
      }

      const ordersAnteriorRaw = await fetchOrderFactsRange(previous.start, previous.endExclusive, canaisFiltro, situacoesFiltro);
      const ordersAnteriorFiltrados = filterOrderRowsWithCutoff(
        ordersAnteriorRaw,
        previous.start,
        previous.endExclusive,
        canaisFiltro,
        situacoesFiltro,
        cutoffOptsAnterior
      );
      ordersAnterior = aggregateOrdersFromRows(ordersAnteriorFiltrados);

      const produtosAnteriorRaw = await fetchProdutoFactsRange(
        previous.start,
        previous.endExclusive,
        canaisFiltro,
        situacoesFiltro
      );
      const produtosAnteriorFiltrados = filterProdutoRowsWithCutoff(
        produtosAnteriorRaw,
        previous.start,
        previous.endExclusive,
        canaisFiltro,
        situacoesFiltro,
        cutoffOptsAnterior
      );
      produtosAnterior = aggregateProdutoFactsFromRows(produtosAnteriorFiltrados);

      orderFacts = [...orderFacts, ...ordersAnterior];
      produtoFacts = [...produtoFacts, ...produtosAnterior];
    }

    let periodoAtual = computePeriodoResumo(ordersAtual, produtosAtuais, current.start, current.displayEnd);
    const vendasPorHoraAtuais = await buildHourlyTrend(DEFAULT_REPORT_TIMEZONE);
    periodoAtual = { ...periodoAtual, vendasPorHora: vendasPorHoraAtuais };

    let periodoAnterior = computePeriodoResumo(ordersAnterior, produtosAnterior, previous.start, previous.displayEnd);

    // Enriquecer top produtos com imagem/estoque quando disponível
    const [topAtualEnriched, topAnteriorEnriched] = await Promise.all([
      enrichTopProdutos(periodoAtual.topProdutos),
      enrichTopProdutos(periodoAnterior.topProdutos),
    ]);
    periodoAtual = { ...periodoAtual, topProdutos: topAtualEnriched };
    periodoAnterior = { ...periodoAnterior, topProdutos: topAnteriorEnriched };

    const canais = computeCanais(ordersAtual);
    const mapaVendasUF = computeMapaUF(ordersAtual);
    const mapaVendasCidade = computeMapaCidade(ordersAtual);
    const canaisDisponiveis = Array.from(new Set(orderFacts.map((o) => o.canal ?? 'Outros')));

    const diffs = computeDiffs(periodoAtual, periodoAnterior);

    const microTrend24h = await buildMicroTrend24h(DEFAULT_REPORT_TIMEZONE, canaisFiltro, situacoesFiltro);

    const lastUpdatedAt = cacheRow?.last_refreshed_at ?? new Date().toISOString();

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
      pedidosAtual: sumPedidosDia(ordersAtual, debugDate),
      pedidosAnterior: sumPedidosDia(ordersAnterior, debugDate),
      detalheAtual: detalhePedidosDia(ordersAtual, debugDate),
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
