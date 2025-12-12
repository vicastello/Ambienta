import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Embalagem, EmbalagemInput, EmbalagemUpdate } from '@/src/types/embalagens';

const TABLE_NAME = 'embalagens' as const;

/**
 * Lista todas as embalagens
 */
export async function listEmbalagens() {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Embalagem[];
}

/**
 * Busca uma embalagem por ID
 */
export async function getEmbalagemById(id: string) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Embalagem;
}

/**
 * Busca uma embalagem por código
 */
export async function getEmbalagemByCodigo(codigo: string) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select('*')
    .eq('codigo', codigo)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Não encontrado
      return null;
    }
    throw error;
  }
  return data as Embalagem;
}

/**
 * Cria uma nova embalagem
 */
export async function createEmbalagem(input: EmbalagemInput) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .insert({
      codigo: input.codigo,
      nome: input.nome,
      descricao: input.descricao || null,
      altura: input.altura,
      largura: input.largura,
      comprimento: input.comprimento,
      preco_unitario: input.preco_unitario,
      estoque_atual: input.estoque_atual,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Embalagem;
}

/**
 * Atualiza uma embalagem existente
 */
export async function updateEmbalagem(id: string, update: EmbalagemUpdate) {
  const updatePayload: Record<string, any> = {};

  if (update.codigo !== undefined) updatePayload.codigo = update.codigo;
  if (update.nome !== undefined) updatePayload.nome = update.nome;
  if (update.descricao !== undefined) updatePayload.descricao = update.descricao || null;
  if (update.altura !== undefined) updatePayload.altura = update.altura;
  if (update.largura !== undefined) updatePayload.largura = update.largura;
  if (update.comprimento !== undefined) updatePayload.comprimento = update.comprimento;
  if (update.preco_unitario !== undefined) updatePayload.preco_unitario = update.preco_unitario;
  if (update.estoque_atual !== undefined) updatePayload.estoque_atual = update.estoque_atual;

  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Embalagem;
}

/**
 * Deleta uma embalagem
 */
export async function deleteEmbalagem(id: string) {
  const { error } = await supabaseAdmin
    .from(TABLE_NAME)
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Atualiza o estoque de uma embalagem
 */
export async function updateEstoqueEmbalagem(id: string, quantidade: number) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .update({ estoque_atual: quantidade })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Embalagem;
}

/**
 * Decrementa o estoque de uma embalagem
 */
export async function decrementarEstoqueEmbalagem(id: string, quantidade: number) {
  // Buscar o estoque atual
  const embalagem = await getEmbalagemById(id);
  const novoEstoque = Number(embalagem.estoque_atual) - quantidade;

  if (novoEstoque < 0) {
    throw new Error(`Estoque insuficiente para a embalagem ${embalagem.nome}`);
  }

  return updateEstoqueEmbalagem(id, novoEstoque);
}
