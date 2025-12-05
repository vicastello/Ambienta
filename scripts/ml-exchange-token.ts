/**
 * Fluxo de uso (PKCE):
 *
 * 1) Rodar em modo INIT (gera code_verifier + code_challenge e imprime URL):
 *    npx ts-node scripts/ml-exchange-token.ts
 *
 *    -> Isso cria scripts/ml-pkce-state.json e mostra a URL de autorização.
 *
 * 2) Abrir a URL no navegador, logar no Mercado Livre e autorizar o app.
 *    O navegador será redirecionado para ML_REDIRECT_URI com ?code=...
 *
 * 3) Copiar o "code" da URL ou da página de callback.
 *
 * 4) Rodar em modo EXCHANGE, passando o code:
 *    npx ts-node scripts/ml-exchange-token.ts SEU_CODE_AQUI
 *
 * 5) O script vai usar o code_verifier salvo no JSON para trocar por access_token + refresh_token.
 *
 * 6) Copiar o access_token retornado para ML_ACCESS_TOKEN no .env.local.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const PKCE_STATE_PATH = path.resolve(process.cwd(), 'scripts', 'ml-pkce-state.json');

interface MeliAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
  live_mode: boolean;
}

function toBase64Url(buffer: Buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateCodeVerifier(): string {
  const raw = crypto.randomBytes(48); // 64 chars base64url aprox (>= 43)
  return toBase64Url(raw);
}

function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return toBase64Url(hash);
}

function savePkceState(codeVerifier: string) {
  const payload = {
    code_verifier: codeVerifier,
    created_at: new Date().toISOString(),
  };
  fs.writeFileSync(PKCE_STATE_PATH, JSON.stringify(payload, null, 2), { encoding: 'utf-8' });
}

function loadPkceState(): string | null {
  if (!fs.existsSync(PKCE_STATE_PATH)) return null;
  try {
    const raw = fs.readFileSync(PKCE_STATE_PATH, 'utf-8');
    const json = JSON.parse(raw);
    return typeof json.code_verifier === 'string' ? json.code_verifier : null;
  } catch {
    return null;
  }
}

function ensureEnv(name: 'ML_APP_ID' | 'ML_CLIENT_SECRET' | 'ML_REDIRECT_URI'): string {
  const val = process.env[name];
  if (!val) {
    throw new Error('ML_APP_ID, ML_CLIENT_SECRET ou ML_REDIRECT_URI não configurados');
  }
  return val;
}

function logDebugEnv(appId: string, redirectUri: string, clientSecret?: string) {
  console.log('[ML OAuth] Env debug:', {
    appId,
    redirectUri,
    hasClientSecret: !!clientSecret,
    clientSecretLength: clientSecret?.length,
  });
}

async function exchange(code: string) {
  const appId = ensureEnv('ML_APP_ID');
  const clientSecret = ensureEnv('ML_CLIENT_SECRET');
  const redirectUri = ensureEnv('ML_REDIRECT_URI');

  const codeVerifier = loadPkceState();
  if (!codeVerifier) {
    console.error(
      'Não foi possível encontrar o code_verifier. Rode o script sem argumentos primeiro (modo INIT) para gerar PKCE.'
    );
    process.exit(1);
  }

  logDebugEnv(appId, redirectUri, clientSecret);
  console.log('[ML OAuth] Usando code:', code);
  console.log('[ML OAuth] Token URL:', 'https://api.mercadolibre.com/oauth/token');
  console.log('[ML OAuth] code_verifier length:', codeVerifier.length);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: appId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('[ML OAuth] Falha na troca de token', {
      status: res.status,
      statusText: res.statusText,
      body: text,
    });
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

function initPkce() {
  const appId = process.env.ML_APP_ID;
  const redirectUri = process.env.ML_REDIRECT_URI;

  if (!appId || !redirectUri) {
    console.error('ML_APP_ID, ML_REDIRECT_URI não configurados');
    process.exit(1);
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  savePkceState(codeVerifier);

  const url = new URL('https://auth.mercadolivre.com.br/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', crypto.randomUUID());

  console.log('[ML OAuth] Modo INIT (PKCE)');
  console.log(`Code verifier salvo em ${PKCE_STATE_PATH}`);
  console.log('Abra esta URL no navegador, faça login e autorize o app:');
  console.log(url.toString());
}

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    initPkce();
    return;
  }

  await exchange(arg);
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
