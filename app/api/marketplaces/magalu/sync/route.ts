import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  listMagaluOrdersV2,
  getAllMagaluOrdersForPeriod,
  mapMagaluOrderToDb,
  mapMagaluOrderItemsToDb,
  getValidAccessToken,
} from '@/lib/magaluClientV2';

const DEFAULT_PERIOD_DAYS = 90;
const INCREMENTAL_PERIOD_DAYS = 3;

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Verificar se Magalu está configurado
    try {
      await getValidAccessToken();
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            message: error instanceof Error ? error.message : 'Magalu não configurado',
            code: 'MAGALU_NOT_CONFIGURED',
          },
        },
        { status: 503 }
      );
    }

    // Parâmetros do request
    let periodDays = INCREMENTAL_PERIOD_DAYS;
    let statusResyncOnly = false;

    try {
      const body = await req.json();
      if (body.periodDays && typeof body.periodDays === 'number') {
        periodDays = Math.min(body.periodDays, 180);
      }
      if (body.initial === true) {
        periodDays = DEFAULT_PERIOD_DAYS;
      }
      if (body.statusResyncOnly === true) {
        statusResyncOnly = true;
        if (!body.periodDays) {
          periodDays = DEFAULT_PERIOD_DAYS;
        }
      }
    } catch {
      // Body vazio ou inválido, usar padrão
    }

    // Atualizar cursor para "running"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any)
      .from('magalu_sync_cursor')
      .upsert({
        id: 1,
        sync_status: 'running',
        error_message: null,
        updated_at: new Date().toISOString(),
      });

    // Modo de ressincronização de status apenas
    if (statusResyncOnly) {
      return await handleStatusResyncOnly(periodDays, startTime);
    }

    // Calcular período
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - periodDays);

    console.log(`[Magalu Sync] Buscando pedidos de ${fromDate.toISOString()} a ${toDate.toISOString()} (${periodDays} dias)`);

    // Buscar todos os pedidos do período
    const orders = await getAllMagaluOrdersForPeriod({
      fromDate,
      toDate,
      onProgress: ({ loaded, total }) => {
        console.log(`[Magalu Sync] ${loaded}/${total} pedidos carregados`);
      },
    });

    console.log(`[Magalu Sync] Total de ${orders.length} pedidos obtidos da API`);

    if (orders.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any)
        .from('magalu_sync_cursor')
        .update({
          sync_status: 'idle',
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

      return NextResponse.json({
        ok: true,
        data: {
          ordersProcessed: 0,
          itemsProcessed: 0,
          periodDays,
          durationMs: Date.now() - startTime,
        },
      });
    }

    // Preparar dados para upsert
    const ordersToUpsert = orders.map((o) => mapMagaluOrderToDb(o));
    const itemsToUpsert = orders.flatMap((o) => mapMagaluOrderItemsToDb(o));

    // Upsert de pedidos (em batches de 500)
    let ordersUpserted = 0;
    for (let i = 0; i < ordersToUpsert.length; i += 500) {
      const batch = ordersToUpsert.slice(i, i + 500);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: ordersError } = await (supabaseAdmin as any)
        .from('magalu_orders')
        .upsert(batch, {
          onConflict: 'id_order',
          ignoreDuplicates: false,
        });

      if (ordersError) {
        console.error(`[Magalu Sync] Erro ao upsert pedidos batch ${i / 500 + 1}:`, ordersError);
        throw new Error(`Erro ao salvar pedidos: ${ordersError.message}`);
      }
      ordersUpserted += batch.length;
    }

    // Upsert de itens (em batches de 500)
    let itemsUpserted = 0;
    if (itemsToUpsert.length > 0) {
      for (let i = 0; i < itemsToUpsert.length; i += 500) {
        const batch = itemsToUpsert.slice(i, i + 500);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: itemsError } = await (supabaseAdmin as any)
          .from('magalu_order_items')
          .upsert(batch, {
            onConflict: 'id_order,id_sku,id_order_package',
            ignoreDuplicates: false,
          });

        if (itemsError) {
          console.error(`[Magalu Sync] Erro ao upsert itens batch ${i / 500 + 1}:`, itemsError);
        } else {
          itemsUpserted += batch.length;
        }
      }
    }

    // Atualizar cursor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any)
      .from('magalu_sync_cursor')
      .update({
        sync_status: 'idle',
        last_sync_at: new Date().toISOString(),
        total_orders_synced: ordersUpserted,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    console.log(`[Magalu Sync] Concluído: ${ordersUpserted} pedidos, ${itemsUpserted} itens em ${Date.now() - startTime}ms`);

    return NextResponse.json({
      ok: true,
      data: {
        ordersProcessed: ordersUpserted,
        itemsProcessed: itemsUpserted,
        periodDays,
        durationMs: Date.now() - startTime,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[Magalu Sync] Erro:', message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any)
      .from('magalu_sync_cursor')
      .update({
        sync_status: 'error',
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (message.toLowerCase().includes('magalu não configurado') || message.toLowerCase().includes('tokens não encontrados')) {
      return NextResponse.json(
        { ok: false, error: { message, code: 'MAGALU_NOT_CONFIGURED' } },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 500 }
    );
  }
}

/**
 * Modo de ressincronização apenas de status
 */
async function handleStatusResyncOnly(periodDays: number, startTime: number) {
  console.log(`[Magalu StatusResync] Iniciando resync de status dos últimos ${periodDays} dias`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - periodDays);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingOrders, error: fetchError } = await (supabaseAdmin as any)
    .from('magalu_orders')
    .select('id_order, order_status')
    .gte('purchased_date', cutoffDate.toISOString());

  if (fetchError) {
    throw new Error(`Erro ao buscar pedidos existentes: ${fetchError.message}`);
  }

  const orderCodes = existingOrders?.map((o: { id_order: string }) => o.id_order) || [];
  console.log(`[Magalu StatusResync] Encontrados ${orderCodes.length} pedidos para verificar`);

  if (orderCodes.length === 0) {
    return NextResponse.json({
      ok: true,
      data: {
        mode: 'statusResyncOnly',
        ordersChecked: 0,
        statusUpdated: 0,
        periodDays,
        durationMs: Date.now() - startTime,
      },
    });
  }

  // Buscar pedidos atualizados da API em batches
  let statusUpdated = 0;
  const statusChanges: Array<{ code: string; from: string; to: string }> = [];
  const batchSize = 100;

  for (let i = 0; i < orderCodes.length; i += batchSize) {
    const batchCodes = orderCodes.slice(i, i + batchSize);

    try {
      // Para cada batch, buscar da API
      const response = await listMagaluOrdersV2({
        limit: batchSize,
        offset: 0,
        placed_at_from: cutoffDate.toISOString(),
      });

      // Criar mapa de status atual
      const existingStatusMap = new Map<string, string>(
        existingOrders
          .filter((o: { id_order: string }) => batchCodes.includes(o.id_order))
          .map((o: { id_order: string; order_status: string }) => [o.id_order, o.order_status] as [string, string])
      );

      // Verificar mudanças
      for (const order of response.data) {
        const currentStatus = existingStatusMap.get(order.code);
        if (currentStatus && currentStatus !== order.status) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updateError } = await (supabaseAdmin as any)
            .from('magalu_orders')
            .update({
              order_status: order.status,
              updated_date: order.updated_at,
              updated_at: new Date().toISOString(),
            })
            .eq('id_order', order.code);

          if (!updateError) {
            statusUpdated++;
            statusChanges.push({
              code: order.code,
              from: currentStatus,
              to: order.status,
            });
          }
        }
      }

      // Rate limiting
      if (i + batchSize < orderCodes.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (batchError) {
      console.error(`[Magalu StatusResync] Erro no batch ${i / batchSize + 1}:`, batchError);
    }
  }

  console.log(`[Magalu StatusResync] Concluído: ${orderCodes.length} verificados, ${statusUpdated} atualizados`);

  return NextResponse.json({
    ok: true,
    data: {
      mode: 'statusResyncOnly',
      ordersChecked: orderCodes.length,
      statusUpdated,
      statusChanges: statusChanges.slice(0, 50),
      periodDays,
      durationMs: Date.now() - startTime,
    },
  });
}

// GET para verificar status do sync
export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cursor, error } = await (supabaseAdmin as any)
      .from('magalu_sync_cursor')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: { message: error.message } }, { status: 500 });
    }

    // Contar pedidos no banco
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: totalOrders } = await (supabaseAdmin as any)
      .from('magalu_orders')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      ok: true,
      data: {
        ...cursor,
        totalOrdersInDb: totalOrders || 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return NextResponse.json({ ok: false, error: { message } }, { status: 500 });
  }
}
