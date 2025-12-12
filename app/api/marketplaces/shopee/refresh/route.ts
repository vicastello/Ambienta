import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/marketplaces/shopee/refresh
 * Renova access_token usando refresh_token e salva em shopee_tokens
 */
export async function POST() {
  const partnerId = process.env.SHOPEE_PARTNER_ID?.trim();
  const partnerKey = process.env.SHOPEE_PARTNER_KEY?.trim();
  const shopId = process.env.SHOPEE_SHOP_ID?.trim();
  const fallbackRefresh = process.env.SHOPEE_REFRESH_TOKEN?.trim();

  if (!partnerId || !partnerKey || !shopId) {
    return NextResponse.json(
      { ok: false, error: 'SHOPEE_PARTNER_ID/KEY ou SHOPEE_SHOP_ID ausentes' },
      { status: 500 }
    );
  }

  // Buscar refresh do banco, fallback para env
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokenRow } = await (supabaseAdmin as any)
    .from('shopee_tokens')
    .select('*')
    .eq('id', 1)
    .single();

  const refreshToken = tokenRow?.refresh_token || fallbackRefresh;
  if (!refreshToken) {
    return NextResponse.json(
      { ok: false, error: 'SHOPEE_REFRESH_TOKEN ausente' },
      { status: 400 }
    );
  }

  const PATH = '/api/v2/auth/access_token/get';
  const timestamp = Math.floor(Date.now() / 1000);
  const base = `${partnerId}${PATH}${timestamp}`;
  const sign = await cryptoSign(base, partnerKey);

  const url = new URL(`https://partner.shopeemobile.com${PATH}`);
  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign);

  const body = {
    partner_id: Number(partnerId),
    shop_id: Number(shopId),
    refresh_token: refreshToken,
  };

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    return NextResponse.json(
      { ok: false, error: data.error || res.statusText },
      { status: 502 }
    );
  }

  const expiresAt = data.expire_in ? new Date(Date.now() + data.expire_in * 1000).toISOString() : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertError } = await (supabaseAdmin as any)
    .from('shopee_tokens')
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
    },
  });
}

async function cryptoSign(base: string, key: string): Promise<string> {
  const crypto = await import('node:crypto');
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(base);
  return hmac.digest('hex');
}
