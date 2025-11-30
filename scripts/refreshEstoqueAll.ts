// Script para atualizar estoque de todos os produtos Tiny ignorando dataAlteracao.
// Uso: LIMIT=200 OFFSET=0 BATCH=10 DELAY=300 RETRIES429=3 npx tsx scripts/refreshEstoqueAll.ts

import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { parse as parseEnv } from 'dotenv';

// Em ESM/tsx, precisamos resolver __dirname manualmente
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '..', '.env.local');
loadEnv({ path: envPath });

// Se ainda faltarem variáveis, tenta parse manual do .env.local
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const parsed = parseEnv(readFileSync(envPath, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (err) {
    console.warn('Não foi possível carregar .env.local manualmente', err);
  }
}
// Demais imports (dependem do .env carregado) serão feitos dinamicamente em main()

type ProdutoRow = { id_produto_tiny: number; codigo?: string | null };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { supabaseAdmin } = await import('../lib/supabaseAdmin');
  const { getAccessTokenFromDbOrRefresh } = await import('../lib/tinyAuth');
  const { obterEstoqueProduto, TinyApiError } = await import('../lib/tinyApi');
  const { upsertProdutosEstoque } = await import('../src/repositories/tinyProdutosRepository');
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
          const { data: existing } = await supabaseAdmin
            .from('tiny_produtos')
            .select('id')
            .eq('id_produto_tiny', produto.id_produto_tiny)
            .limit(1);
          if (!existing || !existing.length) {
            console.warn(`Produto ${produto.id_produto_tiny} não existe no catálogo local. Pulando.`);
            success += 1; // não contar como falha para não abortar loop
            break;
          }
          const { error: updErr } = await supabaseAdmin
            .from('tiny_produtos')
            .update({
              saldo: (estoque as any)?.saldo ?? null,
              reservado: (estoque as any)?.reservado ?? null,
              disponivel: (estoque as any)?.disponivel ?? null,
              data_atualizacao_tiny: (estoque as any)?.dataAlteracao ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq('id_produto_tiny', produto.id_produto_tiny);
          if (updErr) {
            throw updErr;
          }
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
