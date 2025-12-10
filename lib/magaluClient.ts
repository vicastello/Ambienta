import type { MagaluOrdersResponse } from '@/src/types/magalu';

const MAGALU_BASE_URL = 'https://api.integracommerce.com.br/api';

export interface ListMagaluOrdersParams {
  page?: number; // default 1
  perPage?: number; // default 50 (max 100)
  status?: string;
}

/**
 * Autenticação da API Magalu (IntegrCommerce)
 * Usa Basic Auth com API Key ID e Secret
 */
function getMagaluAuthHeaders() {
  const apiKeyId = process.env.MAGALU_API_KEY_ID;
  const apiKeySecret = process.env.MAGALU_API_KEY_SECRET;

  if (!apiKeyId || !apiKeySecret) {
    throw new Error(
      'MAGALU_API_KEY_ID e MAGALU_API_KEY_SECRET não configurados'
    );
  }

  // Basic Auth: base64(apiKeyId:apiKeySecret)
  const credentials = Buffer.from(`${apiKeyId}:${apiKeySecret}`).toString('base64');

  return {
    'Authorization': `Basic ${credentials}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

export async function listMagaluOrders(params: ListMagaluOrdersParams = {}): Promise<MagaluOrdersResponse> {
  const { page = 1, perPage = 50, status } = params;

  const url = new URL(`${MAGALU_BASE_URL}/Order`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(Math.min(perPage, 100)));
  if (status) url.searchParams.set('Status', status);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: getMagaluAuthHeaders(),
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();

      // Tratamento de erros comuns
      if (res.status === 401) {
        throw new Error('Autenticação falhou. Verifique suas credenciais Magalu (API Key ID e Secret).');
      }
      if (res.status === 403) {
        throw new Error('Acesso negado. Verifique as permissões da sua API Key do Magalu.');
      }
      if (res.status === 429) {
        throw new Error('Limite de requisições excedido. Tente novamente em alguns minutos.');
      }

      throw new Error(`Erro ao chamar API Magalu (${res.status}): ${text || res.statusText}`);
    }

    const data = await res.json();
    return data as MagaluOrdersResponse;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erro desconhecido ao buscar pedidos do Magalu.');
  }
}
