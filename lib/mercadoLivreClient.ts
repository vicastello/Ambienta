import type { MeliOrdersSearchResponse } from '@/src/types/mercadoLivre';

const MELI_BASE_URL = 'https://api.mercadolibre.com';

export interface ListMeliOrdersParams {
  sellerId: string;
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

  const endpoint = recent ? '/orders/search/recent' : '/orders/search';
  const url = new URL(MELI_BASE_URL + endpoint);
  url.searchParams.set('seller', sellerId);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sort', 'date_desc');

  if (status) url.searchParams.set('order.status', status);
  if (dateFrom) url.searchParams.set('date_from', dateFrom);
  if (dateTo) url.searchParams.set('date_to', dateTo);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ao chamar Mercado Livre (${res.status}): ${text || res.statusText}`);
  }

  return res.json() as Promise<MeliOrdersSearchResponse>;
}
