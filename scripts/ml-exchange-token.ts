/**
 * Fluxo de uso:
 * 1) Acesse no navegador:
 *    https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=ML_APP_ID&redirect_uri=ML_REDIRECT_URI
 * 2) Faça login e autorize o app.
 * 3) Copie o ?code=... da URL de callback (https://gestao.ambientautilidades.com.br/api/meli/oauth/callback).
 * 4) Rode:
 *    npx ts-node scripts/ml-exchange-token.ts SEU_CODE
 * 5) Copie o access_token retornado e salve em ML_ACCESS_TOKEN no .env.local.
 */

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface MeliAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
  live_mode: boolean;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return value;
}

function readCodeFromArgs(): string | null {
  const args = process.argv.slice(2);
  if (args[0] && !args[0].startsWith('--')) {
    return args[0];
  }
  const flag = args.find((a) => a.startsWith('--code='));
  if (flag) {
    return flag.split('=')[1] ?? null;
  }
  return process.env.ML_AUTH_CODE ?? null;
}

async function main() {
  const mlAppId = requireEnv('ML_APP_ID');
  const mlClientSecret = requireEnv('ML_CLIENT_SECRET');
  const mlRedirectUri = requireEnv('ML_REDIRECT_URI');

  const code = readCodeFromArgs();
  if (!code) {
    console.error('Informe o code como argumento ou defina ML_AUTH_CODE no .env.local');
    process.exit(1);
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', mlAppId);
  body.set('client_secret', mlClientSecret);
  body.set('code', code);
  body.set('redirect_uri', mlRedirectUri);

  console.log('[ML OAuth] Trocando code por tokens...');
  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Falha na troca de token (status ${res.status}): ${text.slice(0, 300)}`);
    process.exit(1);
  }

  let data: MeliAuthResponse;
  try {
    data = JSON.parse(text) as MeliAuthResponse;
  } catch (err) {
    console.error('Erro ao parsear resposta JSON:', err);
    console.error('Resposta:', text);
    process.exit(1);
    return;
  }

  console.log('--- Resposta completa ---');
  console.log(JSON.stringify(data, null, 2));
  console.log('--- Resumo ---');
  console.log('Access token:', data.access_token);
  console.log('Refresh token:', data.refresh_token);
  console.log('Expira em (horas):', Math.round(data.expires_in / 3600));
  console.log('User ID:', data.user_id);
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
