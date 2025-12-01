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

  const { supabaseAdmin } = await import('../lib/supabaseAdmin');
  const { data, error } = await supabaseAdmin
    .from('tiny_produtos')
    .select(
      'id_produto_tiny,codigo,nome,tipo,situacao,saldo,reservado,disponivel,raw_payload'
    )
    .eq('id_produto_tiny', produtoId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    console.log('Produto não encontrado no catálogo local.');
    return;
  }

  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('Falha ao consultar produto no banco', err);
  process.exit(1);
});
