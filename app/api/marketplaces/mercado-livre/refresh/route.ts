import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/marketplaces/mercado-livre/refresh
 * Usa ML_REFRESH_TOKEN para renovar o access_token e salva em meli_tokens
 */
export async function POST() {
  const clientId = process.env.ML_APP_ID?.trim();
  const clientSecret = process.env.ML_CLIENT_SECRET?.trim();
  const fallbackRefresh = process.env.ML_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: 'ML_APP_ID/ML_CLIENT_SECRET ausentes' },
      { status: 500 }
    );
  }

  // Tenta pegar refresh_token do banco
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokenRow } = await (supabaseAdmin as any)
    .from('meli_tokens')
    .select('*')
    .eq('id', 1)
    .single();

  const refreshToken = tokenRow?.refresh_token || fallbackRefresh;
  if (!refreshToken) {
    return NextResponse.json(
      { ok: false, error: 'ML_REFRESH_TOKEN ausente' },
      { status: 400 }
    );
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: params.toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    return NextResponse.json(
      { ok: false, error: data.error || res.statusText },
      { status: 502 }
    );
  }

  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertError } = await (supabaseAdmin as any)
    .from('meli_tokens')
    .upsert({
      id: 1,
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });

  if (upsertError) {
    return NextResponse.json(
      { ok: false, error: `Erro ao salvar tokens: ${upsertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_at: expiresAt,
      user_id: data.user_id,
    },
  });
}
