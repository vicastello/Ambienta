import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getErrorMessage } from '@/lib/errors';

const TOKEN_URL =
  'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';

type TinyOAuthCallbackResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json(
      { ok: false, message: 'Código de autorização (code) não encontrado na URL.' },
      { status: 400 }
    );
  }

  const clientId = process.env.TINY_CLIENT_ID?.trim();
  const clientSecret = process.env.TINY_CLIENT_SECRET?.trim();
  const redirectUri = process.env.TINY_REDIRECT_URI?.trim();

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

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
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

  if (!parsed || typeof parsed !== 'object') {
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

  const json = parsed as TinyOAuthCallbackResponse;

  if (typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string' || typeof json.expires_in !== 'number') {
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
  const expiresAt = now + Math.max(0, (json.expires_in - 60) * 1000); // 1 min de margem

  console.log('[Tiny OAuth callback] Tokens recebidos, salvando em cookies.');

  // cria a resposta redirecionando pro dashboard
  const response = NextResponse.redirect(new URL('/dashboard', req.url));

  // cookies HTTP-only com os tokens
  response.cookies.set('tiny_access_token', json.access_token, {
    httpOnly: true,
    secure: false,
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
  console.log('[Tiny OAuth callback] Iniciando upsert do token...');
  try {
    const { error } = await supabaseAdmin
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

    if (error) {
      console.error('[Tiny OAuth callback] ❌ Erro ao salvar tokens no DB:', error);
      response.cookies.set('oauth_error', `DB Error: ${error.message}`, {
        httpOnly: false,
        path: '/',
      });
    } else {
      console.log('[Tiny OAuth callback] ✅ Tokens salvos no DB com sucesso');
      response.cookies.set('oauth_success', 'true', {
        httpOnly: false,
        path: '/',
      });
    }
  } catch (e) {
    console.error('[Tiny OAuth callback] ❌ Exception ao salvar tokens no DB:', e);
    response.cookies.set('oauth_error', `Exception: ${getErrorMessage(e) || 'Erro desconhecido'}`, {
      httpOnly: false,
      path: '/',
    });
  }

  return response;
}
