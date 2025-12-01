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

const parseId = (): number => {
  const envId = process.env.TARGET_ID;
  if (envId) return Number(envId);
  const arg = process.argv[2];
  return arg ? Number(arg) : NaN;
};

async function main() {
  const produtoId = parseId();
  if (!Number.isFinite(produtoId)) {
    console.error('Informe TARGET_ID ou passe o ID do produto como argumento.');
    process.exit(1);
  }

  const { getAccessTokenFromDbOrRefresh } = await import('../lib/tinyAuth');
  const { obterProduto } = await import('../lib/tinyApi');

  let token = await getAccessTokenFromDbOrRefresh();
  try {
    const detalhe = await obterProduto(token, produtoId, {});
    console.log(JSON.stringify(detalhe, null, 2));
  } catch (err: any) {
    if (err?.status === 401) {
      token = await getAccessTokenFromDbOrRefresh();
      const detalhe = await obterProduto(token, produtoId, {});
      console.log(JSON.stringify(detalhe, null, 2));
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  console.error('Falha ao obter produto', err);
  process.exit(1);
});
