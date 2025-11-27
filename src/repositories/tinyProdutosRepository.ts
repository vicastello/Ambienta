import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Database, Json, TinyProdutosRow } from '@/src/types/db-public';

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

  return { produtos: (data || []) as TinyProdutosRow[], total: count || 0 };
}

export async function getTinyAccessToken() {
  const { data, error } = await supabaseAdmin
    .from('tiny_tokens')
    .select('access_token')
    .single<Database['public']['Tables']['tiny_tokens']['Row']>();

  if (error) throw error;
  if (!data?.access_token) {
    throw new Error('Token do Tiny não encontrado');
  }

  return data.access_token as string;
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
