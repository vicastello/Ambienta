import { listarPedidosTiny, TinyPedidoListaItem } from '@/lib/tinyApi';
import { getTinyOrdersIncrementalConfig, updateTinyOrdersIncrementalCheckpoint } from '@/src/repositories/syncRepository';
import { upsertOrder } from '@/src/repositories/tinyOrdersRepository';
import { upsertPedidoItens } from '@/src/repositories/tinyPedidoItensRepository';
import { formatDateYYYYMMDD } from '@/src/utils/date';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';

/**
 * Executa o sync incremental real dos pedidos Tiny usando dataAtualizacao.
 * Atualiza o checkpoint incremental em sync_settings ao final.
 */
export async function runTinyOrdersIncrementalSync() {
  // 1. Ler checkpoint
  const config = await getTinyOrdersIncrementalConfig();
  let fromCheckpoint: string;
  if (config?.lastUpdatedAt) {
    fromCheckpoint = config.lastUpdatedAt;
  } else {
    // Se não existir checkpoint, usar "agora - 2 dias" (UTC)
    const d = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    fromCheckpoint = d.toISOString();
    await updateTinyOrdersIncrementalCheckpoint(fromCheckpoint);
  }

  // 2. Preparar parâmetros para o Tiny
  const dataAtualizacao = formatDateYYYYMMDD(new Date(fromCheckpoint));
  const limit = 100;
  let offset = 0;
  let totalRequests = 0;
  let totalOrders = 0;
  let maxUpdatedAt: string | null = null;

  const accessToken = await getAccessTokenFromDbOrRefresh();

  while (true) {
    const resp = await listarPedidosTiny(accessToken, {
      dataAtualizacao,
      orderBy: 'asc',
      limit,
      offset,
    }, 'cron_pedidos_incremental');
    totalRequests++;
    const pedidos: TinyPedidoListaItem[] = resp.itens || [];
    if (!pedidos.length) break;

    for (const pedido of pedidos) {
      await upsertOrder(pedido); // upsert em tiny_orders
      await upsertPedidoItens(pedido); // upsert em tiny_pedido_itens
      // Rastrear maior data de atualização (ajuste conforme campo real do payload)
      const updatedAt = (pedido as any).dataAtualizacao || pedido.dataCriacao;
      if (updatedAt && (!maxUpdatedAt || updatedAt > maxUpdatedAt)) {
        maxUpdatedAt = updatedAt;
      }
      totalOrders++;
    }
    if (pedidos.length < limit) break;
    offset += pedidos.length;
  }

  // 3. Atualizar checkpoint se houve pedidos
  if (maxUpdatedAt) {
    await updateTinyOrdersIncrementalCheckpoint(maxUpdatedAt);
  }

  return {
    success: true,
    totalRequests,
    totalOrders,
    fromCheckpoint,
    toCheckpoint: maxUpdatedAt || fromCheckpoint,
  };
}
