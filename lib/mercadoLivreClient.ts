import type { MeliOrdersSearchResponse } from '@/src/types/mercadoLivre';

const MELI_BASE_URL = 'https://api.mercadolibre.com';

export interface ListMeliOrdersParams {
  sellerId?: string;
  accessToken: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  offset?: number;
  limit?: number;
  recent?: boolean;
  refreshToken?: string;
  onTokenRefreshed?: (tokens: { access_token: string; refresh_token?: string; expires_at?: string }) => Promise<void>;
}

export async function listMeliOrders(params: ListMeliOrdersParams): Promise<MeliOrdersSearchResponse> {
  const { sellerId, accessToken, dateFrom, dateTo, status, offset = 0, limit = 50, recent } = params;
  // Log apenas uma vez em dev para inspecionar payload real
  // eslint-disable-next-line no-let
  let resultsLogged = false;

  const endpoint = recent ? '/orders/search/recent' : '/orders/search';
  const url = new URL(MELI_BASE_URL + endpoint);
  if (sellerId) {
    url.searchParams.set('seller', sellerId);
  }
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sort', 'date_desc');

  if (status) url.searchParams.set('order.status', status);
  if (dateFrom) url.searchParams.set('order.date_created.from', dateFrom);
  if (dateTo) url.searchParams.set('order.date_created.to', dateTo);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    // Se 401, tentar refresh se refreshToken disponível
    if (res.status === 401 && params.refreshToken && params.onTokenRefreshed) {
      const refreshed = await refreshMeliToken(params.refreshToken);
      await params.onTokenRefreshed(refreshed);
      // Tentar novamente uma vez
      return listMeliOrders({ ...params, accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token });
    }

    const text = await res.text();
    throw new Error(`Erro ao chamar Mercado Livre (${res.status}): ${text || res.statusText}`);
  }

  const data = (await res.json()) as MeliOrdersSearchResponse;

  if (process.env.NODE_ENV !== 'production' && !resultsLogged) {
    resultsLogged = true;
    const sample = data?.results?.[0];
    if (sample) {
      console.log('[ML RAW ORDER SAMPLE]', JSON.stringify(sample, null, 2));
    }
  }

  return data;
}

export async function getMeliOrder(params: {
  orderId: string | number;
  accessToken: string;
  refreshToken?: string;
  onTokenRefreshed?: (tokens: { access_token: string; refresh_token?: string; expires_at?: string }) => Promise<void>;
}): Promise<Record<string, unknown>> {
  const { orderId, accessToken } = params;
  const url = `${MELI_BASE_URL}/orders/${orderId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401 && params.refreshToken && params.onTokenRefreshed) {
      const refreshed = await refreshMeliToken(params.refreshToken);
      await params.onTokenRefreshed(refreshed);
      return getMeliOrder({ ...params, accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token });
    }

    const text = await res.text();
    throw new Error(`Erro ao buscar pedido ML (${res.status}): ${text || res.statusText}`);
  }

  return (await res.json()) as Record<string, unknown>;
}

async function refreshMeliToken(refreshToken: string): Promise<{ access_token: string; refresh_token?: string; expires_at?: string }> {
  const clientId = process.env.ML_APP_ID?.trim();
  const clientSecret = process.env.ML_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error('ML_APP_ID/ML_CLIENT_SECRET não configurados para refresh');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(`${MELI_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: params.toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Falha ao renovar token ML (${res.status}): ${data.error || res.statusText}`);
  }

  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined;
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expiresAt };
}
