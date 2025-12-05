import type { MagaluOrdersResponse } from '@/src/types/magalu';

const MAGALU_BASE_URL = 'https://api.integracommerce.com.br/api';

export interface ListMagaluOrdersParams {
  page?: number; // default 1
  perPage?: number; // default 50 (max 100)
  status?: string;
}

export async function listMagaluOrders(params: ListMagaluOrdersParams = {}): Promise<MagaluOrdersResponse> {
  const { page = 1, perPage = 50, status } = params;

  const url = new URL(`${MAGALU_BASE_URL}/Order`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(Math.min(perPage, 100)));
  if (status) url.searchParams.set('Status', status);

  const apiKey = process.env.MAGALU_API_KEY;
  if (!apiKey) {
    throw new Error('MAGALU_API_KEY não configurado.');
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ao chamar Magalu (${res.status}): ${text || res.statusText}`);
  }

  return res.json() as Promise<MagaluOrdersResponse>;
}
