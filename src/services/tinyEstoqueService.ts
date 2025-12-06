import { obterEstoqueProduto } from '@/lib/tinyApi';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { upsertProdutosEstoque } from '@/src/repositories/tinyProdutosRepository';
import type { TinyProdutosRow } from '@/src/types/db-public';

export type TinyEstoqueSnapshot = {
  idProdutoTiny: number;
  saldo: number;
  reservado: number;
  disponivel: number;
  depositos?: {
    id: number;
    nome: string;
    desconsiderar: boolean;
    saldo: number;
    reservado: number;
    disponivel: number;
  }[];
  raw?: unknown;
};

const mapEstoquePayload = (payload: any, idProdutoTiny: number): TinyEstoqueSnapshot => {
  const saldo = Number(payload?.estoque?.saldo ?? payload?.saldo ?? 0) || 0;
  const reservado = Number(payload?.estoque?.reservado ?? payload?.reservado ?? 0) || 0;
  const disponivel = Number(payload?.estoque?.disponivel ?? payload?.disponivel ?? saldo - reservado) || 0;

  const depositos = Array.isArray(payload?.estoque?.depositos)
    ? payload.estoque.depositos.map((dep: any) => ({
        id: Number(dep?.id ?? 0) || 0,
        nome: dep?.nome ?? '',
        desconsiderar: Boolean(dep?.desconsiderar),
        saldo: Number(dep?.saldo ?? 0) || 0,
        reservado: Number(dep?.reservado ?? 0) || 0,
        disponivel: Number(dep?.disponivel ?? 0) || 0,
      }))
    : undefined;

  return {
    idProdutoTiny,
    saldo,
    reservado,
    disponivel,
    depositos,
    raw: payload,
  };
};

/**
 * Busca estoque “ao vivo” via Tiny API v3 (GET /estoque/{idProduto}).
 */
export async function getEstoqueProdutoRealTime(
  idProdutoTiny: number,
  context: string = 'unknown'
): Promise<TinyEstoqueSnapshot> {
  console.log('[DEBUG TINY LIVE ESTOQUE] idProdutoTiny =', idProdutoTiny);
  const accessToken = await getAccessTokenFromDbOrRefresh();
  try {
    const payload = await obterEstoqueProduto(accessToken, idProdutoTiny, {
      allowNotModified: false,
      context,
    });
    return mapEstoquePayload(payload, idProdutoTiny);
  } catch (error: any) {
    const status = error?.status ?? error?.response?.status;
    const body = error?.body ?? error?.response?.data ?? error?.message;
    const message = typeof body === 'string' ? body : JSON.stringify(body ?? {});
    const err = new Error(`Tiny estoque error (status ${status ?? 'n/a'}): ${message}`);
    (err as any).status = status;
    throw err;
  }
}

/**
 * Atualiza o estoque de um produto no Supabase usando o snapshot ao vivo do Tiny.
 */
export async function refreshEstoqueProdutoInSupabase(
  idProdutoTiny: number,
  context: string = 'unknown'
): Promise<TinyProdutosRow | null> {
  const snapshot = await getEstoqueProdutoRealTime(idProdutoTiny, context);

  await upsertProdutosEstoque([
    {
      id_produto_tiny: snapshot.idProdutoTiny,
      saldo: snapshot.saldo,
      reservado: snapshot.reservado,
      disponivel: snapshot.disponivel,
      data_atualizacao_tiny: new Date().toISOString(),
    },
  ]);

  const { data } = await supabaseAdmin
    .from('tiny_produtos')
    .select('*')
    .eq('id_produto_tiny', snapshot.idProdutoTiny)
    .maybeSingle<TinyProdutosRow>();

  return data ?? null;
}

export async function getCachedEstoque(idProdutoTiny: number) {
  const { data, error } = await supabaseAdmin
    .from('tiny_produtos')
    .select('id_produto_tiny,saldo,reservado,disponivel,data_atualizacao_tiny')
    .eq('id_produto_tiny', idProdutoTiny)
    .maybeSingle<TinyProdutosRow>();
  if (error) throw error;
  return data ?? null;
}
