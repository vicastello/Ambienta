import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const TOKEN_URL =
  'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json(
      { ok: false, message: 'Código de autorização (code) não encontrado na URL.' },
      { status: 400 }
    );
  }

  const clientId = process.env.TINY_CLIENT_ID;
  const clientSecret = process.env.TINY_CLIENT_SECRET;
  const redirectUri = process.env.TINY_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        ok: false,
        message:
          'CLIENT_ID, CLIENT_SECRET ou REDIRECT_URI do Tiny não configurados.',
      },
      { status: 500 }
    );
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  body.set('redirect_uri', redirectUri);
  body.set('code', code);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });

  const text = await res.text();

  if (!res.ok) {
    console.error('[Tiny OAuth callback] Erro ao trocar code por token:', text);
    return NextResponse.json(
      {
        ok: false,
        step: 'token_request',
        status: res.status,
        message: 'Erro ao obter token de acesso do Tiny.',
        tinyResponse: text,
      },
      { status: 500 }
    );
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch (e) {
    console.error('[Tiny OAuth callback] Não consegui fazer parse do JSON:', text);
    return NextResponse.json(
      {
        ok: false,
        step: 'parse_response',
        message: 'Resposta do Tiny não é um JSON válido.',
        raw: text,
      },
      { status: 500 }
    );
  }

  if (!json.access_token || !json.refresh_token || !json.expires_in) {
    console.error('[Tiny OAuth callback] Resposta inesperada:', json);
    return NextResponse.json(
      {
        ok: false,
        step: 'validate_response',
        message: 'Tiny não retornou access_token/refresh_token/expires_in.',
        tinyResponse: json,
      },
      { status: 500 }
    );
  }

  const now = Date.now();
  const expiresAt = now + (json.expires_in - 60) * 1000; // 1 min de margem

  console.log('[Tiny OAuth callback] Tokens recebidos, salvando em cookies.');

  // cria a resposta redirecionando pro dashboard
  const response = NextResponse.redirect(new URL('/dashboard', req.url));

  // cookies HTTP-only com os tokens
  response.cookies.set('tiny_access_token', json.access_token, {
    httpOnly: true,
    secure: false, // em produção = true com HTTPS
    sameSite: 'lax',
    path: '/',
    maxAge: json.expires_in, // segundos
  });

  response.cookies.set('tiny_refresh_token', json.refresh_token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60, // 1 dia
  });

  response.cookies.set('tiny_expires_at', String(expiresAt), {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: json.expires_in,
  });

  // persist tokens in DB for worker use (upsert)
  try {
    await supabaseAdmin
      .from('tiny_tokens')
      .upsert(
        {
          id: 1,
          access_token: json.access_token,
          refresh_token: json.refresh_token,
          expires_at: expiresAt,
          scope: json.scope ?? null,
          token_type: json.token_type ?? null,
        },
        { onConflict: 'id' }
      );
  } catch (e) {
    console.error('[Tiny OAuth callback] Não foi possível salvar tokens no DB', e);
  }

  return response;
}