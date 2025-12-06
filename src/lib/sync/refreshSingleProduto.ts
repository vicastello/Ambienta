import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import {
  obterProduto,
  obterEstoqueProduto,
  TinyApiError,
  type TinyProdutoDetalhado,
  type TinyEstoqueProduto,
} from '@/lib/tinyApi';
import { buildProdutoUpsertPayload } from '@/lib/productMapper';
import { upsertProduto } from '@/src/repositories/tinyProdutosRepository';
import type { TinyProdutosRow } from '@/src/types/db-public';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_BACKOFF_MS = 32_000;

async function fetchProdutoAtual(id: number) {
  const { data, error } = await supabaseAdmin
    .from('tiny_produtos')
    .select('*')
    .eq('id_produto_tiny', id)
    .maybeSingle<TinyProdutosRow>();

  if (error) throw error;
  return (data as TinyProdutosRow | null) ?? null;
}

export type RefreshProdutoResult = {
  ok: true;
  produto: TinyProdutosRow;
  attempts429: number;
  totalBackoffMs: number;
};

export async function refreshProdutoFromTiny(
  produtoId: number,
  options: { enrichEstoque?: boolean } = {}
): Promise<RefreshProdutoResult> {
  if (!Number.isFinite(produtoId) || produtoId <= 0) {
    throw new Error('produtoId inválido');
  }

  const enrichEstoque = options.enrichEstoque !== false;
  let accessToken = await getAccessTokenFromDbOrRefresh();
  let attempts429 = 0;
  let totalBackoffMs = 0;

  const callTiny = async <T>(executor: (token: string) => Promise<T>): Promise<T> => {
    while (true) {
      try {
        return await executor(accessToken);
      } catch (error) {
        if (error instanceof TinyApiError) {
          if (error.status === 401) {
            accessToken = await getAccessTokenFromDbOrRefresh();
            continue;
          }
          if (error.status === 429) {
            attempts429 += 1;
            const waitMs = Math.min(1000 * 2 ** Math.min(attempts429 - 1, 5), MAX_BACKOFF_MS);
            totalBackoffMs += waitMs;
            await delay(waitMs);
            continue;
          }
        }
        throw error;
      }
    }
  };

  const [detalhe, estoqueDetalhado, registroAtual] = await Promise.all([
    callTiny((token) => obterProduto(token, produtoId, { context: 'api_produtos_refresh' })),
    enrichEstoque
      ? callTiny((token) =>
          obterEstoqueProduto(token, produtoId, { context: 'api_produtos_refresh' }).catch((error) => {
            if (error instanceof TinyApiError && error.status === 404) {
              return null;
            }
            throw error;
          })
        )
      : Promise.resolve(null),
    fetchProdutoAtual(produtoId),
  ]);

  const payload = buildProdutoUpsertPayload({
    resumo: null,
    detalhe: detalhe as TinyProdutoDetalhado,
    estoque: (estoqueDetalhado ?? undefined) as TinyEstoqueProduto | undefined,
    registroAtual,
  });

  await upsertProduto(payload);

  const atualizado = await fetchProdutoAtual(produtoId);
  if (!atualizado) {
    throw new Error('Não foi possível carregar o produto atualizado');
  }

  return {
    ok: true,
    produto: atualizado,
    attempts429,
    totalBackoffMs,
  };
}
