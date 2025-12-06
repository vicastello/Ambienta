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
