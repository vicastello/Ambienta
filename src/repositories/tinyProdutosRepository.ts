import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import type { TinyProdutosRow } from '@/src/types/db-public';

export type ListProdutosParams = {
  search?: string;
  situacao?: string;
  limit?: number;
  offset?: number;
};

export async function listProdutos({
  search = '',
  situacao = 'A',
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

  if (search) {
    query = query.or(
      `nome.ilike.%${search}%,codigo.ilike.%${search}%,gtin.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { produtos: (data || []) as unknown as TinyProdutosRow[], total: count || 0 };
}

export async function getTinyAccessToken() {
  // Proxy para manter compatibilidade com chamadas antigas.
  return getAccessTokenFromDbOrRefresh();
}

export async function upsertProduto(
  produtoData: Partial<TinyProdutosRow> & { id_produto_tiny: number }
) {
  const admin = supabaseAdmin as any;
  const { error } = await admin
    .from('tiny_produtos')
    .upsert(
      produtoData as any,
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
}) {
  const { id_produto_tiny, fornecedor_codigo, embalagem_qtd } = params;
  const admin = supabaseAdmin as any;
  const { error } = await admin
    .from('tiny_produtos')
    .update({
      fornecedor_codigo: fornecedor_codigo ?? null,
      embalagem_qtd: embalagem_qtd ?? null,
    } as any)
    .eq('id_produto_tiny', id_produto_tiny);

  if (error) throw error;
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
  | 'embalagem_qtd'
  | 'tipo'
  | 'situacao'
>;

export async function listProdutosAtivosSimples() {
  const { data, error } = await supabaseAdmin
    .from('tiny_produtos')
    .select(
      'id_produto_tiny,codigo,nome,gtin,saldo,reservado,disponivel,fornecedor_codigo,embalagem_qtd,tipo,situacao'
    )
    .eq('situacao', 'A')
    .eq('tipo', 'S');

  if (error) throw error;
  return (data || []) as ProdutoBaseRow[];
}

export async function countProdutos() {
  const { count, error } = await supabaseAdmin
    .from('tiny_produtos')
    .select('*', { count: 'exact', head: true });

  if (error) throw error;
  return count || 0;
}
