// lib/orderEnricher.ts
import { obterPedidoDetalhado, TinyPedidoListaItem } from './tinyApi';
import { extrairFreteFromRaw } from './tinyMapping';

export interface EnrichmentResult {
  valorFrete: number | null;
  detailsFetched: boolean;
}

/**
 * Enriquece um pedido da listagem buscando seus detalhes completos
 * para obter valorFrete que não vem na listagem
 */
export async function enrichOrderWithDetails(
  accessToken: string,
  pedido: TinyPedidoListaItem,
  options: {
    skipIfHasFrete?: boolean; // se já tem frete no pedido, pula
    delayMs?: number; // delay entre chamadas para rate limit
  } = {}
): Promise<EnrichmentResult> {
  const { skipIfHasFrete = true, delayMs = 0 } = options;

  // Se já tem valorFrete no pedido da listagem, não precisa buscar
  if (skipIfHasFrete) {
    const freteAtual = extrairFreteFromRaw(pedido);
    if (freteAtual && freteAtual > 0) {
      return { valorFrete: freteAtual, detailsFetched: false };
    }
  }

  if (!pedido.id) {
    return { valorFrete: null, detailsFetched: false };
  }

  try {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const detalhado = await obterPedidoDetalhado(accessToken, pedido.id);
    const valorFrete = extrairFreteFromRaw(detalhado);

    return { valorFrete, detailsFetched: true };
  } catch (error: any) {
    console.warn(`[orderEnricher] Falha ao buscar detalhes do pedido ${pedido.id}:`, error?.message);
    return { valorFrete: null, detailsFetched: false };
  }
}

/**
 * Enriquece um lote de pedidos em paralelo com controle de concorrência
 */
export async function enrichOrdersBatch(
  accessToken: string,
  pedidos: TinyPedidoListaItem[],
  options: {
    batchSize?: number; // quantos buscar em paralelo
    delayMs?: number; // delay entre batches
    skipIfHasFrete?: boolean;
  } = {}
): Promise<Map<number, number>> {
  const { batchSize = 5, delayMs = 500, skipIfHasFrete = true } = options;
  
  const freteMap = new Map<number, number>();
  
  for (let i = 0; i < pedidos.length; i += batchSize) {
    const batch = pedidos.slice(i, i + batchSize);
    
    const results = await Promise.all(
      batch.map(async (pedido) => {
        const result = await enrichOrderWithDetails(accessToken, pedido, {
          skipIfHasFrete,
          delayMs: 0, // delay é entre batches, não entre itens do batch
        });
        return { id: pedido.id, frete: result.valorFrete };
      })
    );

    results.forEach(({ id, frete }) => {
      if (id && frete !== null) {
        freteMap.set(id, frete);
      }
    });

    // Delay entre batches para respeitar rate limit
    if (i + batchSize < pedidos.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return freteMap;
}
