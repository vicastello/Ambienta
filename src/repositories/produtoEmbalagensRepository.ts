import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { ProdutoEmbalagem, ProdutoEmbalagemInput } from '@/src/types/embalagens';

const TABLE_NAME = 'produto_embalagens' as const;

/**
 * Lista todas as embalagens vinculadas a um produto
 */
export async function listEmbalagensByProdutoId(produtoId: number) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select(`
      *,
      embalagem:embalagens(*)
    `)
    .eq('produto_id', produtoId);

  if (error) throw error;
  return data as Array<ProdutoEmbalagem & { embalagem: any }>;
}

/**
 * Lista todas as embalagens vinculadas a vários produtos (batch)
 */
export async function listEmbalagensByProdutoIds(produtoIds: number[]) {
  const ids = Array.from(new Set(produtoIds.filter((id) => Number.isFinite(id)))) as number[];
  if (ids.length === 0) return [] as Array<ProdutoEmbalagem & { embalagem: any }>;

  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select(`
      *,
      embalagem:embalagens(*)
    `)
    .in('produto_id', ids);

  if (error) throw error;
  return data as Array<ProdutoEmbalagem & { embalagem: any }>;
}

/**
 * Vincula uma embalagem a um produto
 */
export async function vincularEmbalagem(input: ProdutoEmbalagemInput) {
  // Verifica se já existe
  const { data: existing } = await supabaseAdmin
    .from(TABLE_NAME)
    .select('*')
    .eq('produto_id', input.produto_id)
    .eq('embalagem_id', input.embalagem_id)
    .single();

  if (existing) {
    // Atualiza a quantidade se já existe
    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .update({ quantidade: input.quantidade })
      .eq('produto_id', input.produto_id)
      .eq('embalagem_id', input.embalagem_id)
      .select()
      .single();

    if (error) throw error;
    return data as ProdutoEmbalagem;
  }

  // Cria novo vínculo
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .insert({
      produto_id: input.produto_id,
      embalagem_id: input.embalagem_id,
      quantidade: input.quantidade,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ProdutoEmbalagem;
}

/**
 * Atualiza a quantidade de embalagem em um vínculo
 */
export async function atualizarQuantidadeEmbalagem(
  produtoId: number,
  embalagemId: string,
  quantidade: number
) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .update({ quantidade })
    .eq('produto_id', produtoId)
    .eq('embalagem_id', embalagemId)
    .select()
    .single();

  if (error) throw error;
  return data as ProdutoEmbalagem;
}

/**
 * Remove vínculo entre produto e embalagem
 */
export async function desvincularEmbalagem(produtoId: number, embalagemId: string) {
  const { error } = await supabaseAdmin
    .from(TABLE_NAME)
    .delete()
    .eq('produto_id', produtoId)
    .eq('embalagem_id', embalagemId);

  if (error) throw error;
}

/**
 * Remove todos os vínculos de um produto
 */
export async function desvincularTodasEmbalagens(produtoId: number) {
  const { error } = await supabaseAdmin
    .from(TABLE_NAME)
    .delete()
    .eq('produto_id', produtoId);

  if (error) throw error;
}

/**
 * Busca produtos que usam uma embalagem específica
 */
export async function listProdutosByEmbalagemId(embalagemId: string) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select('*')
    .eq('embalagem_id', embalagemId);

  if (error) throw error;
  return data as ProdutoEmbalagem[];
}
