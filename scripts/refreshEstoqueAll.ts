// Script para atualizar estoque de todos os produtos Tiny ignorando dataAlteracao.
// Uso: LIMIT=200 OFFSET=0 BATCH=10 DELAY=300 RETRIES429=3 npx tsx scripts/refreshEstoqueAll.ts

import { config as loadEnv } from 'dotenv';
import path from 'path';

loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { obterEstoqueProduto, TinyApiError } from '../lib/tinyApi';
import { upsertProdutosEstoque } from '../src/repositories/tinyProdutosRepository';

type ProdutoRow = { id_produto_tiny: number; codigo?: string | null };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const limit = Number(process.env.LIMIT ?? 200);
  const offset = Number(process.env.OFFSET ?? 0);
  const batchSize = Number(process.env.BATCH ?? 10);
  const delayMs = Number(process.env.DELAY ?? 300);
  const maxRetries429 = Number(process.env.RETRIES429 ?? 3);

  const { data, error } = await supabaseAdmin
    .from('tiny_produtos')
    .select('id_produto_tiny,codigo')
    .order('id_produto_tiny', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  const produtos = (data ?? []) as ProdutoRow[];
  if (!produtos.length) {
    console.log('Nenhum produto encontrado.');
    return;
  }

  console.log(`Atualizando estoque de ${produtos.length} produtos (offset ${offset}, limit ${limit})...`);

  let token = await getAccessTokenFromDbOrRefresh();
  let success = 0;
  let fail = 0;
  let requests = 0;
  let total429 = 0;

  for (let i = 0; i < produtos.length; i += batchSize) {
    const slice = produtos.slice(i, i + batchSize);
    for (const produto of slice) {
      if (!produto.id_produto_tiny) continue;
      let retries = 0;
      while (true) {
        try {
          requests += 1;
          const estoque = await obterEstoqueProduto(token, produto.id_produto_tiny, {});
          await upsertProdutosEstoque([
            {
              id_produto_tiny: produto.id_produto_tiny,
              saldo: (estoque as any)?.saldo ?? null,
              reservado: (estoque as any)?.reservado ?? null,
              disponivel: (estoque as any)?.disponivel ?? null,
              data_atualizacao_tiny: (estoque as any)?.dataAlteracao ?? null,
            },
          ]);
          success += 1;
          break;
        } catch (err: any) {
          if (err instanceof TinyApiError && err.status === 401) {
            console.warn('Token expirado, renovando...');
            token = await getAccessTokenFromDbOrRefresh();
            continue;
          }
          if (err instanceof TinyApiError && err.status === 429 && retries < maxRetries429) {
            total429 += 1;
            retries += 1;
            const backoff = 1000 * retries;
            console.warn(`429 recebido para produto ${produto.id_produto_tiny}, backoff ${backoff}ms (tentativa ${retries})`);
            await sleep(backoff);
            continue;
          }
          fail += 1;
          console.error(`Falha ao atualizar estoque do produto ${produto.id_produto_tiny}`, err);
          break;
        }
      }
      await sleep(delayMs);
    }
  }

  console.log('Resumo estoque full: ', { success, fail, requests, total429 });
}

main().catch((err) => {
  console.error('Erro no refresh de estoque:', err);
  process.exit(1);
});
