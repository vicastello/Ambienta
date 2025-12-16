import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProdutoParentMapping } from '@/lib/productRelationships';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import type { TinyProdutosRow, TinyProdutosInsert } from '@/src/types/db-public';

export class TinyProdutoNotFoundError extends Error {
  constructor(id: number) {
    super(`Produto ${id} não encontrado`);
    this.name = 'TinyProdutoNotFoundError';
  }
}

export type ListProdutosParams = {
  search?: string;
  situacao?: string;
  tipo?: string;
  fornecedor?: string;
  limit?: number;
  offset?: number;
};

export async function listProdutos({
  search = '',
  situacao = 'all',
  tipo = 'all',
  fornecedor = '',
  limit = 50,
  offset = 0,
}: ListProdutosParams) {
  let query = supabaseAdmin
    .from('tiny_produtos')
    .select('*', { count: 'exact' })
    .order('nome', { ascending: true })
    .range(offset, offset + limit - 1);

  if (situacao && situacao !== 'all') {
    query = query.eq('situacao', situacao);
  }

  if (tipo && tipo !== 'all') {
    query = query.eq('tipo', tipo);
  }

  if (fornecedor) {
    query = query.ilike('fornecedor_nome', `%${fornecedor}%`);
  }

  if (search) {
    query = query.or(
      `nome.ilike.%${search}%,codigo.ilike.%${search}%,gtin.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const rawProdutos = (data || []) as unknown as TinyProdutosRow[];
  const produtos = rawProdutos.map((row) => ({ ...row })) as TinyProdutoWithAgregado[];
  await attachDisponivelTotal(produtos);
  await attachEmbalagens(produtos);

  return { produtos, total: count || 0 };
}

export async function getTinyAccessToken() {
  // Proxy para manter compatibilidade com chamadas antigas.
  return getAccessTokenFromDbOrRefresh();
}

const sanitizeProdutoPayload = (
  produtoData: Partial<TinyProdutosRow> & { id_produto_tiny: number }
): Partial<TinyProdutosRow> & { id_produto_tiny: number } => {
  const next: Partial<TinyProdutosRow> & { id_produto_tiny: number } = {
    ...produtoData,
  };

  const codigo = typeof next.codigo === 'string' ? next.codigo.trim() : '';
  next.codigo = codigo || `ID-${next.id_produto_tiny}`;

  const nome = typeof next.nome === 'string' ? next.nome.trim() : '';
  next.nome = nome || `Produto ${next.id_produto_tiny}`;

  return next;
};

export async function upsertProduto(
  produtoData: Partial<TinyProdutosRow> & { id_produto_tiny: number }
) {
  const admin = supabaseAdmin as any;
  const payload = sanitizeProdutoPayload(produtoData);
  const { error } = await admin
    .from('tiny_produtos')
    .upsert(
      payload as TinyProdutosInsert,
      { onConflict: 'id_produto_tiny', ignoreDuplicates: false }
    );

  if (error) throw error;
}

export type TinyProdutoEstoqueUpsert = {
  id_produto_tiny: number;
  saldo?: number | null;
  reservado?: number | null;
  disponivel?: number | null;
  preco?: number | null;
  preco_promocional?: number | null;
  data_atualizacao_tiny?: string | null;
};

export async function upsertProdutosEstoque(
  produtos: TinyProdutoEstoqueUpsert[]
) {
  if (!produtos.length) return;

  const admin = supabaseAdmin as any;
  for (const produto of produtos) {
    const payload = {
      saldo: produto.saldo ?? null,
      reservado: produto.reservado ?? null,
      disponivel: produto.disponivel ?? null,
      preco: produto.preco ?? null,
      preco_promocional: produto.preco_promocional ?? null,
      data_atualizacao_tiny: produto.data_atualizacao_tiny ?? null,
    } as any;

    const { error } = await admin
      .from('tiny_produtos')
      .update(payload)
      .eq('id_produto_tiny', produto.id_produto_tiny);

    if (error) throw error;
  }
}

export async function updateFornecedorEmbalagem(params: {
  id_produto_tiny: number;
  fornecedor_codigo?: string | null;
  embalagem_qtd?: number | null;
  observacao_compras?: string | null;
}) {
  const { id_produto_tiny, fornecedor_codigo, embalagem_qtd, observacao_compras } = params;
  const admin = supabaseAdmin as any;
  const { error, data } = await admin
    .from('tiny_produtos')
    .update({
      fornecedor_codigo: fornecedor_codigo ?? null,
      embalagem_qtd: embalagem_qtd ?? null,
      observacao_compras: observacao_compras ?? null,
    } as any)
    .eq('id_produto_tiny', id_produto_tiny)
    .select('id_produto_tiny');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new TinyProdutoNotFoundError(id_produto_tiny);
  }
}

export type ProdutoBaseRow = Pick<
  TinyProdutosRow,
  | 'id_produto_tiny'
  | 'codigo'
  | 'nome'
  | 'gtin'
  | 'saldo'
  | 'reservado'
  | 'disponivel'
  | 'fornecedor_codigo'
  | 'fornecedor_nome'
  | 'embalagem_qtd'
  | 'observacao_compras'
  | 'imagem_url'
  | 'tipo'
  | 'situacao'
  | 'categoria'
> & { preco_custo: number };

export async function listProdutosAtivosSimples() {
  const { data, error } = await supabaseAdmin
    .from('tiny_produtos')
    .select(
      'id_produto_tiny,codigo,nome,gtin,saldo,reservado,disponivel,fornecedor_codigo,fornecedor_nome,embalagem_qtd,observacao_compras,imagem_url,tipo,situacao,categoria,raw_payload'
    )
    .eq('situacao', 'A')
    .eq('tipo', 'S');

  if (error) throw error;

  return (data || []).map((row: any) => {
    const cost = row.raw_payload?.precos?.precoCusto;
    const preco_custo = typeof cost === 'number' ? cost : 0;

    // Return explicit object matching ProdutoBaseRow and excluding raw_payload for memory safety
    return {
      id_produto_tiny: row.id_produto_tiny,
      codigo: row.codigo,
      nome: row.nome,
      gtin: row.gtin,
      saldo: row.saldo,
      reservado: row.reservado,
      disponivel: row.disponivel,
      fornecedor_codigo: row.fornecedor_codigo,
      fornecedor_nome: row.fornecedor_nome,
      embalagem_qtd: row.embalagem_qtd,
      observacao_compras: row.observacao_compras,
      imagem_url: row.imagem_url,
      tipo: row.tipo,
      situacao: row.situacao,
      categoria: row.categoria,
      preco_custo
    };
  });
}

export async function countProdutos() {
  const { count, error } = await supabaseAdmin
    .from('tiny_produtos')
    .select('*', { count: 'exact', head: true });

  if (error) throw error;
  return count || 0;
}

type TinyProdutoWithAgregado = TinyProdutosRow & {
  disponivel_total?: number | null;
};

const normalizeCodigoForLookup = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : null;
};

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const SUPABASE_IN_CLAUSE_LIMIT = 800;

async function attachDisponivelTotal(produtos: TinyProdutoWithAgregado[]) {
  if (!produtos.length) return;

  const parentMapping = await loadProdutoParentMapping();
  const parentIds = new Set<number>();
  const produtoToParentId = new Map<number, number>();

  for (const produto of produtos) {
    const parentInfoById = parentMapping.idToParent.get(produto.id_produto_tiny);
    const normalizedCodigo = normalizeCodigoForLookup(produto.codigo);
    const parentInfoByCode = normalizedCodigo ? parentMapping.codeToParent.get(normalizedCodigo) : undefined;
    const parentInfo = parentInfoById ?? parentInfoByCode;
    const parentId = parentInfo?.parentId ?? produto.id_produto_tiny;
    produtoToParentId.set(produto.id_produto_tiny, parentId);
    if (parentId) parentIds.add(parentId);
  }

  if (!parentIds.size) {
    produtos.forEach((produto) => {
      produto.disponivel_total = produto.disponivel ?? null;
    });
    return;
  }

  const parentChildren = new Map<number, Set<number>>();
  for (const parentId of parentIds) {
    parentChildren.set(parentId, new Set());
  }

  for (const [childId, parentInfo] of parentMapping.idToParent) {
    const parentId = parentInfo.parentId;
    if (!parentId) continue;
    const group = parentChildren.get(parentId);
    if (group) {
      group.add(childId);
    }
  }

  const allGroupIds = Array.from(
    new Set([
      ...Array.from(parentIds),
      ...Array.from(parentChildren.values()).flatMap((set) => Array.from(set)),
    ])
  );

  if (!allGroupIds.length) {
    produtos.forEach((produto) => {
      produto.disponivel_total = produto.disponivel ?? null;
    });
    return;
  }

  const estoqueRows: Array<Pick<TinyProdutosRow, 'id_produto_tiny' | 'disponivel'>> = [];
  const chunks = chunkArray(allGroupIds, SUPABASE_IN_CLAUSE_LIMIT);
  for (const idsChunk of chunks) {
    if (!idsChunk.length) continue;
    const { data: partial } = await supabaseAdmin
      .from('tiny_produtos')
      .select('id_produto_tiny, disponivel')
      .in('id_produto_tiny', idsChunk)
      .throwOnError();
    if (partial?.length) {
      estoqueRows.push(...partial);
    }
  }

  const disponivelById = new Map<number, number | null>();
  for (const row of estoqueRows) {
    disponivelById.set(row.id_produto_tiny, row.disponivel ?? null);
  }

  const parentTotals = new Map<number, number | null>();
  for (const parentId of parentIds) {
    const children = parentChildren.get(parentId);
    const childIds = children ? Array.from(children) : [];
    if (childIds.length) {
      let total = 0;
      let hasNumeric = false;
      for (const childId of childIds) {
        const value = disponivelById.get(childId);
        if (typeof value === 'number') {
          total += value;
          hasNumeric = true;
        }
      }
      parentTotals.set(parentId, hasNumeric ? total : null);
      continue;
    }

    // Sem filhos: usa o próprio saldo/disponível do produto
    const selfValue = disponivelById.get(parentId);
    parentTotals.set(parentId, typeof selfValue === 'number' ? selfValue : null);
  }

  for (const produto of produtos) {
    const parentId = produtoToParentId.get(produto.id_produto_tiny);
    const aggregated = parentId ? parentTotals.get(parentId) ?? null : null;
    produto.disponivel_total = aggregated ?? produto.disponivel ?? null;
  }
}

/**
 * Anexa embalagens vinculadas aos produtos
 */
async function attachEmbalagens(produtos: TinyProdutoWithAgregado[]) {
  if (!produtos.length) return;

  const produtoIds = produtos.map((p) => p.id);

  // Busca todas as embalagens vinculadas em uma única query
  const { data, error } = await supabaseAdmin
    .from('produto_embalagens')
    .select(`
      produto_id,
      embalagem_id,
      quantidade,
      embalagem:embalagens(id, codigo, nome)
    `)
    .in('produto_id', produtoIds);

  if (error) {
    console.error('Erro ao buscar embalagens vinculadas:', error);
    return;
  }

  // Mapeia embalagens por produto_id
  type EmbalagemVinculo = {
    produto_id: number;
    embalagem_id: string;
    quantidade: number;
    embalagem: { id: string; codigo: string; nome: string } | null;
  };

  const embalagensByProduto = new Map<number, any[]>();
  for (const vinculo of (data || []) as EmbalagemVinculo[]) {
    const existing = embalagensByProduto.get(vinculo.produto_id) || [];
    existing.push({
      embalagem_id: vinculo.embalagem_id,
      quantidade: vinculo.quantidade,
      embalagem: vinculo.embalagem,
    });
    embalagensByProduto.set(vinculo.produto_id, existing);
  }

  // Anexa as embalagens aos produtos
  for (const produto of produtos) {
    (produto as any).embalagens = embalagensByProduto.get(produto.id) || [];
  }
}
