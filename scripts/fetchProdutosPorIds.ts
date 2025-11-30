// Busca produtos específicos no Tiny e upserta no catálogo com imagem/estoque.
// Uso: TARGET_IDS=1,2,3 npx tsx scripts/fetchProdutosPorIds.ts

import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { parse as parseEnv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', '.env.local');
loadEnv({ path: envPath });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const parsed = parseEnv(readFileSync(envPath, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) {
      if (!process.env[k]) process.env[k] = v;
    }
  } catch (err) {
    console.warn('Não foi possível carregar .env.local manualmente', err);
  }
}

const parseIds = (): number[] => {
  const envIds = process.env.TARGET_IDS || '';
  return envIds
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0);
};

async function main() {
  const { getAccessTokenFromDbOrRefresh } = await import('../lib/tinyAuth');
  const { obterProduto, obterEstoqueProduto } = await import('../lib/tinyApi');
  const { upsertProduto } = await import('../src/repositories/tinyProdutosRepository');

  const ids = parseIds();
  if (!ids.length) {
    console.error('Defina TARGET_IDS com IDs do Tiny separados por vírgula');
    process.exit(1);
  }

  let token = await getAccessTokenFromDbOrRefresh();
  const maxRetries = Number(process.env.RETRIES429 ?? 8);

  for (const id of ids) {
    let attempts = 0;
    try {
      let done = false;
      let detalhe: any = null;
      let estoque: any = null;

      while (!done) {
        try {
          detalhe = await obterProduto(token, id, {});
          try {
            estoque = await obterEstoqueProduto(token, id, {});
          } catch (err) {
            console.warn('Estoque falhou para', id, err);
          }
          done = true;
        } catch (err: any) {
          if (err?.status === 401) {
            console.warn('Token expirado, renovando...');
            token = await getAccessTokenFromDbOrRefresh();
            continue;
          }
          if (err?.status === 429 && attempts < maxRetries) {
            attempts += 1;
            const backoff = 1000 * attempts;
            console.warn(`429 no produto ${id}. Backoff ${backoff}ms (tentativa ${attempts}/${maxRetries})`);
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
          throw err;
        }
      }

      const detalheEstoque = detalhe?.estoque || {};
      const estOk = estoque || {};
      const detalhePrecos = detalhe?.precos || {};
      const dims = detalhe?.dimensoes || {};
      const produtoData: any = {
        id_produto_tiny: id,
        codigo: detalhe?.codigo ?? null,
        nome: detalhe?.nome ?? detalhe?.descricao ?? null,
        unidade: detalhe?.unidade ?? null,
        preco: detalhePrecos?.preco ?? null,
        preco_promocional: detalhePrecos?.precoPromocional ?? null,
        situacao: detalhe?.situacao ?? null,
        tipo: detalhe?.tipo ?? null,
        gtin: detalhe?.gtin ?? null,
        imagem_url: detalhe?.anexos?.find?.((a: any) => a.url)?.url ?? null,
        saldo: detalheEstoque?.saldo ?? estOk?.saldo ?? null,
        reservado: detalheEstoque?.reservado ?? estOk?.reservado ?? null,
        disponivel: detalheEstoque?.disponivel ?? estOk?.disponivel ?? null,
        descricao: detalhe?.descricao ?? null,
        ncm: detalhe?.ncm ?? null,
        origem: detalhe?.origem ?? null,
        peso_liquido: dims?.pesoLiquido ?? null,
        peso_bruto: dims?.pesoBruto ?? null,
        data_criacao_tiny: detalhe?.dataCriacao ?? null,
        data_atualizacao_tiny: detalhe?.dataAlteracao ?? null,
      };
      await upsertProduto(produtoData);
      console.log('Upsert OK', id, 'imagem:', produtoData.imagem_url);
    } catch (err) {
      console.error('Falha produto', id, err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
