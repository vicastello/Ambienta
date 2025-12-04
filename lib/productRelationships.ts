import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Json, TinyProdutosRow } from '@/src/types/db-public';

export const VARIACAO_PATHS: Array<Array<string>> = [
  ['variacoes'],
  ['produto', 'variacoes'],
  ['variacoes', 'variacao'],
  ['produto', 'variacoes', 'variacao'],
];

export const KIT_PATHS: Array<Array<string>> = [
  ['componentes'],
  ['produto', 'componentes'],
  ['componentes', 'componente'],
  ['produto', 'componentes', 'componente'],
  ['kit'],
  ['componentesKit'],
  ['produto', 'componentesKit'],
  ['itensKit'],
  ['produto', 'itensKit'],
  ['kit', 'componentes'],
  ['kit', 'itens'],
];

const ARRAY_FALLBACK_KEYS = ['item', 'items', 'itens', 'variacao', 'variacoes', 'componentes', 'componente'];

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const toTrimmedStringOrNull = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

export function normalizeToArray(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    for (const key of ARRAY_FALLBACK_KEYS) {
      const nested = value[key];
      if (!nested) continue;
      const normalized = normalizeToArray(nested);
      if (normalized.length) return normalized;
    }
    return [value];
  }
  return [];
}

export function pickFirstArray(raw: Record<string, unknown>, paths: Array<Array<string>>): unknown[] {
  for (const path of paths) {
    let current: unknown = raw;
    for (const segment of path) {
      if (!current || typeof current !== 'object') {
        current = null;
        break;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    const normalized = normalizeToArray(current);
    if (normalized.length) return normalized;
  }
  return [];
}

export function addIdCandidates(entry: Record<string, unknown> | null | undefined, target: Set<number>) {
  if (!entry || typeof entry !== 'object') return;
  const produtoNestedRaw = entry['produto'];
  const produtoNested = isRecord(produtoNestedRaw) ? produtoNestedRaw : null;
  const candidates = [
    entry['id'],
    entry['idProduto'],
    entry['id_produto'],
    entry['produto_id'],
    entry['idProdutoPai'],
    entry['id_produto_pai'],
    entry['produtoPaiId'],
    produtoNested?.['id'],
    produtoNested?.['idProduto'],
    produtoNested?.['id_produto'],
    produtoNested?.['produto_id'],
  ];
  for (const candidate of candidates) {
    const parsed = toNumberOrNull(candidate);
    if (parsed && parsed > 0) {
      target.add(parsed);
    }
  }
}

export function addCodeCandidates(entry: Record<string, unknown> | null | undefined, target: Set<string>) {
  if (!entry || typeof entry !== 'object') return;
  const produtoNestedRaw = entry['produto'];
  const produtoNested = isRecord(produtoNestedRaw) ? produtoNestedRaw : null;
  const candidates = [
    entry['codigo'],
    entry['codigoProduto'],
    entry['codigo_produto'],
    entry['sku'],
    produtoNested?.['codigo'],
    produtoNested?.['codigoProduto'],
    produtoNested?.['codigo_produto'],
    produtoNested?.['sku'],
  ];
  for (const candidate of candidates) {
    const parsed = toTrimmedStringOrNull(candidate);
    if (parsed) target.add(parsed);
  }
}

export function extractRelatedEntries(
  raw: Record<string, unknown> | Json,
  tipo: string | null | undefined
): { entries: unknown[]; source: 'variacoes' | 'kit' | null } {
  if (!isRecord(raw)) return { entries: [], source: null };
  const tipoNormalizado = typeof tipo === 'string' ? tipo.trim().toUpperCase() : null;

  const kitEntries = pickFirstArray(raw, KIT_PATHS);
  if (kitEntries.length) {
    return { entries: kitEntries, source: 'kit' };
  }

  const variacaoEntries = pickFirstArray(raw, VARIACAO_PATHS);
  if (variacaoEntries.length) {
    return { entries: variacaoEntries, source: 'variacoes' };
  }

  // Caso não haja caminhos encontrados, mantém comportamento legado baseado no tipo
  if (tipoNormalizado === 'K') {
    return { entries: kitEntries, source: 'kit' };
  }
  if (tipoNormalizado === 'V') {
    return { entries: variacaoEntries, source: 'variacoes' };
  }

  return { entries: [], source: null };
}

type TinyProdutoParentRow = Pick<
  TinyProdutosRow,
  'id_produto_tiny' | 'codigo' | 'nome' | 'tipo' | 'raw_payload' | 'imagem_url'
>;

export type ProdutoParentInfo = {
  parentId: number | null;
  parentCodigo: string | null;
  parentNome: string;
  parentImagemUrl: string | null;
  parentTipo: TinyProdutosRow['tipo'] | null;
  childSource: 'variacoes' | 'kit';
};

export type ProdutoParentMapping = {
  idToParent: Map<number, ProdutoParentInfo>;
  codeToParent: Map<string, ProdutoParentInfo>;
};

const emptyParentMapping = (): ProdutoParentMapping => ({
  idToParent: new Map(),
  codeToParent: new Map(),
});

const normalizeCodigo = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
};

const normalizeSkuInput = (sku: string | null | undefined): string | null => {
  if (!sku || typeof sku !== 'string') return null;
  const trimmed = sku.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
};

const normalizeNome = (value: unknown): string => {
  if (typeof value !== 'string') return 'Produto sem nome';
  const trimmed = value.trim();
  return trimmed || 'Produto sem nome';
};

const tipoPriority = (tipo: TinyProdutosRow['tipo'] | null | undefined): number => {
  const normalized = typeof tipo === 'string' ? tipo.trim().toUpperCase() : null;
  switch (normalized) {
    case 'K':
      return 4;
    case 'P':
      return 3;
    case 'V':
      return 2;
    case 'S':
      return 1;
    default:
      return 0;
  }
};

const childSourcePriority = (source: ProdutoParentInfo['childSource'] | null | undefined) => {
  if (source === 'kit') return 2;
  if (source === 'variacoes') return 1;
  return 0;
};

const buildPriorityScore = (info: ProdutoParentInfo | undefined): number => {
  if (!info) return 0;
  return tipoPriority(info.parentTipo) * 10 + childSourcePriority(info.childSource);
};

const shouldReplaceParent = (
  atual: ProdutoParentInfo | undefined,
  candidato: ProdutoParentInfo
): boolean => {
  if (!atual) return true;
  const prioridadeAtual = buildPriorityScore(atual);
  const prioridadeCandidato = buildPriorityScore(candidato);
  if (prioridadeCandidato > prioridadeAtual) return true;
  if (prioridadeCandidato < prioridadeAtual) return false;

  // Mesma prioridade: prefere quem tem ID/código definido
  if (!atual.parentId && candidato.parentId) return true;
  if (!atual.parentCodigo && candidato.parentCodigo) return true;

  return false;
};

const chooseBestParent = (
  ...candidates: Array<ProdutoParentInfo | null | undefined>
): ProdutoParentInfo | null => {
  let chosen: ProdutoParentInfo | undefined;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (shouldReplaceParent(chosen, candidate)) {
      chosen = candidate;
    }
  }
  return chosen ?? null;
};

export const resolveParentChain = (
  produtoId: number | null | undefined,
  sku: string | null,
  relacionamentos: ProdutoParentMapping
): { finalParent: ProdutoParentInfo | null; chain: ProdutoParentInfo[] } => {
  const chain: ProdutoParentInfo[] = [];
  let currentId = typeof produtoId === 'number' ? produtoId : null;
  let currentSku = normalizeSkuInput(sku);
  const visited = new Set<string>();
  const MAX_DEPTH = 12;

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const parentById = currentId ? relacionamentos.idToParent.get(currentId) : null;
    const parentBySku = currentSku ? relacionamentos.codeToParent.get(currentSku) : null;
    const nextParent = chooseBestParent(parentById, parentBySku);
    if (!nextParent) break;

    chain.push(nextParent);
    const nextId = nextParent.parentId ?? currentId;
    const nextSku = normalizeSkuInput(nextParent.parentCodigo ?? currentSku);
    const key = `${nextId ?? 'null'}:${nextSku ?? 'null'}`;
    if (visited.has(key)) break;
    visited.add(key);

    if (nextId === currentId && nextSku === currentSku) break;
    currentId = nextId;
    currentSku = nextSku;
  }

  return {
    finalParent: chain.at(-1) ?? null,
    chain,
  };
};

export async function loadProdutoParentMapping(): Promise<ProdutoParentMapping> {
  try {
    const { data } = await supabaseAdmin
      .from('tiny_produtos')
      .select<'id_produto_tiny,codigo,nome,tipo,raw_payload', TinyProdutoParentRow>(
        'id_produto_tiny,codigo,nome,tipo,raw_payload'
      )
      .in('tipo', ['P', 'V', 'K'])
      .throwOnError();

    const mapping: ProdutoParentMapping = emptyParentMapping();
    const rows = data ?? [];

    for (const row of rows) {
      if (!row?.raw_payload || !isRecord(row.raw_payload)) continue;
      const { entries, source } = extractRelatedEntries(row.raw_payload, row.tipo);
      if (!entries.length || !source) continue;

      const parentInfo: ProdutoParentInfo = {
        parentId: typeof row.id_produto_tiny === 'number' ? row.id_produto_tiny : null,
        parentCodigo: normalizeCodigo(row.codigo),
        parentNome: normalizeNome(row.nome),
        parentImagemUrl: typeof row.imagem_url === 'string' ? row.imagem_url : null,
        parentTipo: row.tipo ?? null,
        childSource: source,
      };

      for (const entryRaw of entries) {
        if (!entryRaw || typeof entryRaw !== 'object') continue;
        const entry = entryRaw as Record<string, unknown>;
        const ids = new Set<number>();
        const codes = new Set<string>();
        addIdCandidates(entry, ids);
        addCodeCandidates(entry, codes);

        for (const id of ids) {
          if (!id || (parentInfo.parentId && id === parentInfo.parentId)) continue;
          const atual = mapping.idToParent.get(id);
          if (shouldReplaceParent(atual, parentInfo)) {
            mapping.idToParent.set(id, parentInfo);
          }
        }

        for (const code of codes) {
          const normalizedCode = normalizeCodigo(code);
          if (!normalizedCode || (parentInfo.parentCodigo && normalizedCode === parentInfo.parentCodigo)) {
            continue;
          }
          const atual = mapping.codeToParent.get(normalizedCode);
          if (shouldReplaceParent(atual, parentInfo)) {
            mapping.codeToParent.set(normalizedCode, parentInfo);
          }
        }
      }
    }

    return mapping;
  } catch (error) {
    console.warn('[productRelationships] Falha ao carregar pais de produtos', error);
    return emptyParentMapping();
  }
}
