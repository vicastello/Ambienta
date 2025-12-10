import type { MagaluOrdersResponse } from '@/src/types/magalu';

const MAGALU_BASE_URL = 'https://api.integracommerce.com.br/api';

export interface ListMagaluOrdersParams {
  page?: number; // default 1
  perPage?: number; // default 50 (max 100)
  status?: string;
}

/**
 * Autenticação da API Magalu
 * Usa OAuth 2.0 Bearer token obtido via fluxo de autorização
 */
function getMagaluAuthHeaders() {
  const accessToken = process.env.MAGALU_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error(
      'MAGALU_ACCESS_TOKEN não configurado. Execute o fluxo OAuth acessando /api/magalu/oauth/auth'
    );
  }

  return {
    'Authorization': `Bearer ${accessToken}`,
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
