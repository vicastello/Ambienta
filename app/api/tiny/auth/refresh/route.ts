import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getErrorMessage } from '@/lib/errors';

const TOKEN_URL = process.env.TINY_TOKEN_URL ?? 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';
const CLIENT_ID = process.env.TINY_CLIENT_ID;
const CLIENT_SECRET = process.env.TINY_CLIENT_SECRET;

type TinyTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

/**
 * POST /api/tiny/auth/refresh
 * 
 * Força a renovação manual do token do Tiny.
 * Útil quando o CLIENT_ID/SECRET mudam no ambiente.
 */
export async function POST(request: Request) {
  try {
    // 1. Buscar refresh_token atual
    const { data: tokenRow, error: tokenErr } = await supabaseAdmin
      .from('tiny_tokens')
      .select('id, access_token, refresh_token, expires_at, scope, token_type')
      .eq('id', 1)
      .maybeSingle();

    if (tokenErr) {
      console.error('[refresh] erro ao ler tiny_tokens', tokenErr);
      return NextResponse.json({ 
        success: false, 
        error: 'Erro ao ler tokens do banco' 
      }, { status: 500 });
    }

    if (!tokenRow || !tokenRow.refresh_token) {
      return NextResponse.json({ 
        success: false, 
        error: 'Nenhum refresh_token encontrado. Conecte o Tiny primeiro em /api/tiny/auth/login',
        needsAuth: true
      }, { status: 400 });
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return NextResponse.json({ 
        success: false, 
        error: 'CLIENT_ID ou CLIENT_SECRET não configurados no ambiente' 
      }, { status: 500 });
    }

    // 2. Renovar token
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('client_id', CLIENT_ID);
    body.set('client_secret', CLIENT_SECRET);
    body.set('refresh_token', tokenRow.refresh_token);

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded', 
        Accept: 'application/json' 
      },
      body,
    });

    const text = await res.text();
    
    if (!res.ok) {
      console.error('[refresh] Erro ao renovar token:', res.status, text);
      
      // Se refresh_token inválido, precisa reconectar
      if (res.status === 400 || res.status === 401) {
        return NextResponse.json({ 
          success: false, 
          error: 'Refresh token inválido ou expirado. Reconecte o Tiny em /api/tiny/auth/login',
          needsAuth: true
        }, { status: 401 });
      }

      return NextResponse.json({ 
        success: false, 
        error: `Erro ao renovar token: ${text}` 
      }, { status: 500 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error('[refresh] Resposta inválida:', text);
      return NextResponse.json({ 
        success: false, 
        error: 'Resposta inválida do servidor Tiny' 
      }, { status: 500 });
    }

    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({ success: false, error: 'Resposta inválida do servidor Tiny' }, { status: 500 });
    }

    const json = parsed as TinyTokenResponse;

    if (!json.access_token) {
      return NextResponse.json({ success: false, error: 'Tiny não retornou access_token' }, { status: 500 });
    }

    // 3. Salvar novos tokens
    const nowMs = Date.now();
    const expiresInSeconds = typeof json.expires_in === 'number' ? json.expires_in : 0;
    const expiresAt = nowMs + Math.max(0, (expiresInSeconds - 60) * 1000);

    const { error: updateErr } = await supabaseAdmin
      .from('tiny_tokens')
      .upsert(
        {
          id: 1,
          access_token: json.access_token,
          refresh_token: json.refresh_token ?? tokenRow.refresh_token,
          expires_at: expiresAt,
          scope: json.scope ?? tokenRow.scope ?? null,
          token_type: json.token_type ?? tokenRow.token_type ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (updateErr) {
      console.error('[refresh] Erro ao salvar tokens:', updateErr);
      return NextResponse.json({ 
        success: false, 
        error: 'Erro ao salvar tokens renovados' 
      }, { status: 500 });
    }

    // 4. Log de sucesso
    await supabaseAdmin.from('sync_logs').insert({
      job_id: null,
      level: 'info',
      message: 'Token Tiny renovado manualmente',
      meta: { 
        expires_in: expiresInSeconds,
        scope: json.scope ?? null,
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Token renovado com sucesso',
      expires_at: new Date(expiresAt).toISOString(),
      scope: json.scope ?? null,
    });

  } catch (error: unknown) {
    console.error('[refresh] Erro inesperado:', error);
    return NextResponse.json({ 
      success: false, 
      error: getErrorMessage(error) || 'Erro inesperado ao renovar token' 
    }, { status: 500 });
  }
}

/**
 * GET /api/tiny/auth/refresh
 * 
 * Retorna o status atual do token
 */
export async function GET() {
  try {
    const { data: tokenRow, error: tokenErr } = await supabaseAdmin
      .from('tiny_tokens')
      .select('id, access_token, refresh_token, expires_at, scope, token_type')
      .eq('id', 1)
      .maybeSingle();

    if (tokenErr) {
      return NextResponse.json({ 
        success: false, 
        error: 'Erro ao ler tokens' 
      }, { status: 500 });
    }

    if (!tokenRow) {
      return NextResponse.json({
        success: true,
        connected: false,
        message: 'Nenhum token configurado',
        needsAuth: true
      });
    }

    const now = Date.now();
    const expiresAtMs = typeof tokenRow.expires_at === 'number' ? tokenRow.expires_at : null;
    const isValid = Boolean(tokenRow.access_token) && typeof expiresAtMs === 'number' && expiresAtMs > now;

    const expiresIn = typeof expiresAtMs === 'number'
      ? Math.floor((expiresAtMs - now) / 1000)
      : null;

    return NextResponse.json({
      success: true,
      connected: !!tokenRow.refresh_token,
      tokenValid: isValid,
      expiresAt: typeof expiresAtMs === 'number' ? new Date(expiresAtMs).toISOString() : null,
      expiresIn: expiresIn, // segundos
      scope: tokenRow.scope,
      needsAuth: !tokenRow.refresh_token,
      needsRefresh: !isValid && !!tokenRow.refresh_token
    });

  } catch (error: unknown) {
    return NextResponse.json({ 
      success: false, 
      error: getErrorMessage(error) || 'Erro ao consultar tokens' 
    }, { status: 500 });
  }
}
