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

type DashboardResposta = {
  periodoAtual: PeriodoResumo;
  periodoAnterior: PeriodoResumo;
  periodoAnteriorCards: PeriodoResumo;
  canais: CanalResumo[];
  canaisDisponiveis: string[];
  situacoesDisponiveis: Array<{ codigo: number; descricao: string }>;
  mapaVendasUF: VendasUF[];
  mapaVendasCidade: VendasCidade[];
  lastUpdatedAt: string | null;
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

const withinRange = (dateStr: string | null | undefined, inicio: string, fim: string) => {
  if (!dateStr) return false;
  return dateStr >= inicio && dateStr <= fim;
};

const filterOrders = (
  facts: CacheOrderFact[],
  inicio: string,
  fim: string,
  canaisFiltro: string[] | null,
  situacoesFiltro: number[] | null
) =>
  facts.filter((f) =>
    withinRange(f.data, inicio, fim) &&
    (!canaisFiltro?.length || (f.canal ? canaisFiltro.includes(f.canal) : false)) &&
    (!situacoesFiltro?.length || situacoesFiltro.includes(toNumberSafe(f.situacao ?? -1)))
  );

const filterProdutos = (
  facts: CacheProdutoFact[],
  inicio: string,
  fim: string,
  canaisFiltro: string[] | null,
  situacoesFiltro: number[] | null
) =>
  facts.filter((f) =>
    withinRange(f.data, inicio, fim) &&
    (!canaisFiltro?.length || (f.canal ? canaisFiltro.includes(f.canal) : false)) &&
    (!situacoesFiltro?.length || situacoesFiltro.includes(Number(f.situacao ?? -1)))
  );

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
  dataFinalStr: string,
  canaisFiltro: string[] | null,
  situacoesFiltro: number[] | null
): Promise<CacheProdutoFact[]> => {
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
        tiny_orders!inner(data_criacao, canal, situacao)
      `
    )
    .gte('tiny_orders.data_criacao', dataInicialStr)
    .lte('tiny_orders.data_criacao', dataFinalStr);

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

  const produtoFactsMap = aggregateMap(
    data ?? [],
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

  return Array.from(produtoFactsMap.values()).filter((f) => !!f.data);
};

const buildFactsOnTheFly = async (
  dataInicialStr: string,
  dataFinalStr: string
): Promise<DashboardCacheRow | null> => {
  const { data: orders, error: ordersErr } = await supabaseAdmin
    .from('tiny_orders')
    .select('id,data_criacao,canal,situacao,cidade,uf,valor,valor_frete')
    .gte('data_criacao', dataInicialStr)
    .lte('data_criacao', dataFinalStr);

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
    .lte('tiny_orders.data_criacao', dataFinalStr);

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
    periodo_fim: dataFinalStr,
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

  const lookup: Record<string, { imagemUrl: string | null; saldo: number | null; reservado: number | null; disponivel: number | null }> = {};

  if (ids.length) {
    const { data, error } = await supabaseAdmin
      .from('tiny_produtos')
      .select('id_produto_tiny,codigo,imagem_url,saldo,reservado,disponivel')
      .in('id_produto_tiny', ids);
    if (!error && data) {
      for (const row of data) {
        const key = row.id_produto_tiny ? `id:${row.id_produto_tiny}` : null;
        if (key) {
          lookup[key] = {
            imagemUrl: row.imagem_url ?? null,
            saldo: row.saldo ?? null,
            reservado: row.reservado ?? null,
            disponivel: row.disponivel ?? null,
          };
        }
        if (row.codigo) {
          lookup[`sku:${row.codigo}`] = {
            imagemUrl: row.imagem_url ?? null,
            saldo: row.saldo ?? null,
            reservado: row.reservado ?? null,
            disponivel: row.disponivel ?? null,
          };
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
          lookup[`sku:${row.codigo}`] = {
            imagemUrl: row.imagem_url ?? null,
            saldo: row.saldo ?? null,
            reservado: row.reservado ?? null,
            disponivel: row.disponivel ?? null,
          };
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
    const horaComparacaoParam = searchParams.get('horaComparacaoMinutos');
    const horaComparacaoVal = horaComparacaoParam ? Number(horaComparacaoParam) : null;
    const horaComparacaoMinutos = Number.isFinite(horaComparacaoVal)
      ? clampMinutes(horaComparacaoVal as number)
      : null;

    const hoje = new Date();
    const dataFinalDate = dataFinalParam ? new Date(`${dataFinalParam}T00:00:00`) : hoje;
    const dataInicialDate = dataInicialParam
      ? new Date(`${dataInicialParam}T00:00:00`)
      : addDias(dataFinalDate, -1 * ((diasParam ? Number(diasParam) : 30) - 1));

    const dataInicialStr = dataInicialDate.toISOString().slice(0, 10);
    const dataFinalStr = dataFinalDate.toISOString().slice(0, 10);
    const diasJanela = Math.max(1, diffDias(dataInicialDate, dataFinalDate) + 1);
    const hojeTimezoneStr = todayInTimeZone(DEFAULT_REPORT_TIMEZONE);
    const isSingleDayFilter = dataInicialStr === dataFinalStr;
    const aplicarCorteHoraAnteriorCards =
      isSingleDayFilter && dataFinalStr === hojeTimezoneStr && horaComparacaoMinutos !== null;

    const canaisFiltro = canaisParam ? canaisParam.split(',').filter(Boolean) : null;
    const situacoesFiltro = situacoesParam
      ? situacoesParam
          .split(',')
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n))
      : null;

    // Período anterior (mês anterior completo)
    const dataInicialAnteriorDate = new Date(dataInicialDate);
    dataInicialAnteriorDate.setMonth(dataInicialAnteriorDate.getMonth() - 1);
    dataInicialAnteriorDate.setDate(1);

    const dataFinalAnteriorDate = new Date(dataInicialAnteriorDate);
    dataFinalAnteriorDate.setMonth(dataFinalAnteriorDate.getMonth() + 1);
    dataFinalAnteriorDate.setDate(0);

    const dataInicialAnteriorStr = dataInicialAnteriorDate.toISOString().slice(0, 10);
    const dataFinalAnteriorStr = dataFinalAnteriorDate.toISOString().slice(0, 10);

    // Cards com janela móvel (mês anterior até hoje do mês passado ou dia anterior)
    const dataInicialAnteriorCardsDate = new Date(dataInicialDate);
    const dataFinalAnteriorCardsDate = new Date(dataFinalDate);
    if (isSingleDayFilter) {
      dataInicialAnteriorCardsDate.setDate(dataInicialAnteriorCardsDate.getDate() - 1);
      dataFinalAnteriorCardsDate.setDate(dataFinalAnteriorCardsDate.getDate() - 1);
    } else {
      dataInicialAnteriorCardsDate.setMonth(dataInicialAnteriorCardsDate.getMonth() - 1);
      dataFinalAnteriorCardsDate.setMonth(dataFinalAnteriorCardsDate.getMonth() - 1);
    }
    const dataInicialAnteriorCardsStr = dataInicialAnteriorCardsDate.toISOString().slice(0, 10);
    const dataFinalAnteriorCardsStr = dataFinalAnteriorCardsDate.toISOString().slice(0, 10);

    console.time(supabaseTimer);
    const refreshInterval = Math.max(365, diasJanela);
    let cacheRow = await loadCacheRow(dataInicialStr, dataFinalStr);
    if (!cacheRow) {
      const { error: refreshError } = await supabaseAdmin.rpc(
        'refresh_dashboard_resumo_cache',
        { interval_days: refreshInterval }
      );
      if (refreshError) {
        console.error('[dashboard] erro ao recalcular cache', refreshError);
      }
      cacheRow = await loadCacheRow(dataInicialStr, dataFinalStr);
    }
    console.timeEnd(supabaseTimer);

    if (!cacheRow) {
      cacheRow = await buildFactsOnTheFly(dataInicialStr, dataFinalStr);
    }

    if (!cacheRow) {
      return NextResponse.json({ message: 'Cache de dashboard indisponível ou vazio após recalculo' }, { status: 503 });
    }

    const orderFacts = Array.isArray(cacheRow.order_facts) ? cacheRow.order_facts : [];
    const produtoFacts = Array.isArray(cacheRow.produto_facts) ? cacheRow.produto_facts : [];

    const ordersAtual = filterOrders(orderFacts, dataInicialStr, dataFinalStr, canaisFiltro, situacoesFiltro);
    let produtosAtuais = filterProdutos(produtoFacts, dataInicialStr, dataFinalStr, canaisFiltro, situacoesFiltro);
    if (!produtosAtuais.length && ordersAtual.length) {
      produtosAtuais = await fetchProdutoFactsRange(dataInicialStr, dataFinalStr, canaisFiltro, situacoesFiltro);
    }

    let periodoAtual = computePeriodoResumo(ordersAtual, produtosAtuais, dataInicialStr, dataFinalStr);

    const ordersAnterior = filterOrders(orderFacts, dataInicialAnteriorStr, dataFinalAnteriorStr, canaisFiltro, situacoesFiltro);
    let produtosAnterior = filterProdutos(
      produtoFacts,
      dataInicialAnteriorStr,
      dataFinalAnteriorStr,
      canaisFiltro,
      situacoesFiltro
    );
    if (!produtosAnterior.length && ordersAnterior.length) {
      produtosAnterior = await fetchProdutoFactsRange(
        dataInicialAnteriorStr,
        dataFinalAnteriorStr,
        canaisFiltro,
        situacoesFiltro
      );
    }
    let periodoAnterior = computePeriodoResumo(
      ordersAnterior,
      produtosAnterior,
      dataInicialAnteriorStr,
      dataFinalAnteriorStr
    );

    const ordersAnteriorCards = filterOrders(
      orderFacts,
      dataInicialAnteriorCardsStr,
      dataFinalAnteriorCardsStr,
      canaisFiltro,
      situacoesFiltro
    ).filter((order) => {
      if (!aplicarCorteHoraAnteriorCards || horaComparacaoMinutos === null) return true;
      // manter a consistência de corte de hora usando inserted_at/updated_at não está disponível no cache;
      // como fallback, não aplicamos corte adicional para não perder pedidos.
      return true;
    });

    let produtosAnteriorCards = filterProdutos(
      produtoFacts,
      dataInicialAnteriorCardsStr,
      dataFinalAnteriorCardsStr,
      canaisFiltro,
      situacoesFiltro
    );
    if (!produtosAnteriorCards.length && ordersAnteriorCards.length) {
      produtosAnteriorCards = await fetchProdutoFactsRange(
        dataInicialAnteriorCardsStr,
        dataFinalAnteriorCardsStr,
        canaisFiltro,
        situacoesFiltro
      );
    }

    const periodoAnteriorCards = computePeriodoResumo(
      ordersAnteriorCards,
      produtosAnteriorCards,
      dataInicialAnteriorCardsStr,
      dataFinalAnteriorCardsStr
    );
    // Para os cards, a contagem de produtos vendidos não é relevante; mantemos topProdutos vazio para evitar custo extra.
    periodoAnteriorCards.topProdutos = [];
    periodoAnteriorCards.totalProdutosVendidos = 0;

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

    const resposta: DashboardResposta = {
      periodoAtual,
      periodoAnterior,
      periodoAnteriorCards,
      canais,
      canaisDisponiveis,
      situacoesDisponiveis: [...TODAS_SITUACOES],
      mapaVendasUF,
      mapaVendasCidade,
      lastUpdatedAt: cacheRow.last_refreshed_at ?? null,
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
