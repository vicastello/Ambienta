import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAllShopeeOrdersForPeriod, getShopeeEscrowDetailsForOrders, getShopeeOrderDetails } from '@/lib/shopeeClient';
import type { ShopeeOrder } from '@/src/types/shopee';

const DEFAULT_PERIOD_DAYS = 90; // Sync inicial: 90 dias
const INCREMENTAL_PERIOD_DAYS = 3; // Sync incremental: 3 dias
const STATUS_RESYNC_BATCH_SIZE = 50; // Máximo de pedidos por batch no get_order_detail

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getOrderItems(order: ShopeeOrder): JsonRecord[] {
  const raw = order as unknown as { order_items?: unknown; item_list?: unknown };
  const items = asArray(raw.order_items).length ? asArray(raw.order_items) : asArray(raw.item_list);
  return items.filter(isRecord);
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function mergeEscrowDetail(rawPayload: unknown, escrow: unknown) {
  const base =
    rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)
      : {};
  return {
    ...base,
    escrow_detail: escrow,
  };
}

// Extrai cidade e UF do endereço completo
function extractCityState(fullAddress: string | undefined): { city: string | null; state: string | null } {
  if (!fullAddress) return { city: null, state: null };
  
  // Padrão comum: "... - Cidade - UF" ou "... Cidade - UF" ou "... Cidade/UF"
  const patterns = [
    /[-,]\s*([^-,]+)\s*[-/]\s*([A-Z]{2})\s*$/i, // "- Cidade - UF" ou ", Cidade/UF"
    /\b([A-Za-zÀ-ÿ\s]+)\s*[-/]\s*([A-Z]{2})\s*$/i, // "Cidade - UF" no final
  ];
  
  for (const pattern of patterns) {
    const match = fullAddress.match(pattern);
    if (match) {
      return {
        city: match[1].trim(),
        state: match[2].toUpperCase(),
      };
    }
  }
  
  return { city: null, state: null };
}

// Converte pedido Shopee para formato do banco
function mapShopeeOrderToDb(order: ShopeeOrder, shopId: string) {
  const { city, state } = extractCityState(order.recipient_address?.full_address);
  const items = getOrderItems(order);

  // Se a Shopee não mandar total_amount, calcula a partir dos itens
  const computedTotal = items.reduce((sum, item) => {
    const quantity =
      toNumber(
        item['model_quantity_purchased'] ??
        item['order_quantity'] ??
        item['quantity'] ??
        item['model_quantity'] ??
        1,
        1
      ) || 1;
    const discounted =
      toNumber(item['variation_discounted_price'] ?? item['model_discounted_price'] ?? item['item_price'] ?? 0, 0) || 0;
    const original =
      toNumber(item['variation_original_price'] ?? item['model_original_price'] ?? item['item_price'] ?? 0, 0) || 0;
    const price = discounted > 0 ? discounted : original;
    return sum + (price || 0) * quantity;
  }, 0);
  
  return {
    order_sn: order.order_sn,
    shop_id: parseInt(shopId, 10),
    order_status: order.order_status,
    create_time: new Date(order.create_time * 1000).toISOString(),
    update_time: new Date(order.update_time * 1000).toISOString(),
    currency: order.currency || 'BRL',
    total_amount: parseFloat(order.total_amount) || computedTotal || 0,
    shipping_carrier: order.shipping_carrier || null,
    cod: order.cod || false,
    buyer_user_id: null, // Não disponível no get_order_list básico
    buyer_username: null,
    recipient_name: order.recipient_address?.name || null,
    recipient_phone: order.recipient_address?.phone || null,
    recipient_full_address: order.recipient_address?.full_address || null,
    recipient_city: city,
    recipient_state: state,
    raw_payload: order as unknown as Record<string, unknown>,
  };
}

// Converte itens do pedido para formato do banco
function mapShopeeOrderItemsToDb(order: ShopeeOrder) {
  const items = getOrderItems(order);

  if (!items.length) return [];
  
  const agg = new Map<
    string,
    {
      order_sn: string;
      item_id: number;
      model_id: number;
      item_name: string;
      model_name: string | null;
      item_sku: string | null;
      model_sku: string | null;
      quantity: number;
      original_price: number | null;
      discounted_price: number | null;
      is_wholesale: boolean;
      raw_payload: Record<string, unknown>;
    }
  >();

  for (const item of items) {
    const quantity =
      toNumber(
        item['model_quantity_purchased'] ??
        item['order_quantity'] ??
        item['quantity'] ??
        item['model_quantity'] ??
        1,
        1
      ) || 1;
    const rawOriginal =
      toNumber(item['variation_original_price'] ?? item['model_original_price'] ?? item['item_price'] ?? 0, 0) || 0;
    const rawDiscounted =
      toNumber(
        item['variation_discounted_price'] ??
        item['model_discounted_price'] ??
        item['item_price'] ??
        item['variation_original_price'] ??
        0,
        0
      ) || 0;
    const originalPrice = rawOriginal > 0 ? rawOriginal : null;
    const discountedPrice = rawDiscounted > 0 ? rawDiscounted : null;

    const modelId = toNumber(item['model_id'] ?? 0, 0) || 0;
    const itemId = toNumber(item['item_id'] ?? 0, 0) || 0;
    const key = `${order.order_sn}|${itemId}|${modelId}`;
    const curr = agg.get(key);
    if (curr) {
      curr.quantity += quantity;
    } else {
      agg.set(key, {
        order_sn: order.order_sn,
        item_id: itemId,
        model_id: modelId,
        item_name: String(item['item_name'] ?? ''),
        model_name: typeof item['model_name'] === 'string' && item['model_name'] ? item['model_name'] : null,
        item_sku: typeof item['item_sku'] === 'string' && item['item_sku'] ? item['item_sku'] : null,
        model_sku: typeof item['model_sku'] === 'string' && item['model_sku'] ? item['model_sku'] : null,
        quantity,
        original_price: originalPrice,
        discounted_price: discountedPrice,
        is_wholesale: Boolean(item['is_wholesale']),
        raw_payload: item as Record<string, unknown>,
      });
    }
  }

  return Array.from(agg.values());
}

export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    // Verificar se Shopee está configurada
    const shopId = process.env.SHOPEE_SHOP_ID;
    if (!shopId) {
      return NextResponse.json(
        { ok: false, error: { message: 'Shopee não configurada (SHOPEE_SHOP_ID ausente)', code: 'SHOPEE_NOT_CONFIGURED' } },
        { status: 503 }
      );
    }

    // Parâmetros do request
    let periodDays = INCREMENTAL_PERIOD_DAYS;
    let statusResyncOnly = false;
    let includeEscrow: boolean | null = null;
    try {
      const body = await req.json();
      if (body.periodDays && typeof body.periodDays === 'number') {
        periodDays = Math.min(body.periodDays, 180); // Máximo 180 dias
      }
      if (body.initial === true) {
        periodDays = DEFAULT_PERIOD_DAYS; // Sync inicial completo
      }
      if (body.statusResyncOnly === true) {
        statusResyncOnly = true;
        // No modo statusResyncOnly, usar período maior por padrão
        if (!body.periodDays) {
          periodDays = DEFAULT_PERIOD_DAYS;
        }
      }
      if (body.includeEscrow === true) {
        includeEscrow = true;
      } else if (body.includeEscrow === false) {
        includeEscrow = false;
      }
    } catch {
      // Body vazio ou inválido, usar padrão
    }
    if (includeEscrow === null) {
      includeEscrow = periodDays <= 7;
    }

    // ============ MODO STATUS RESYNC ONLY ============
    if (statusResyncOnly) {
      return await handleStatusResyncOnly(periodDays, shopId, startTime);
    }

    // Atualizar status do cursor para "running"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any)
      .from('shopee_sync_cursor')
      .upsert({
        id: 1,
        sync_status: 'running',
        error_message: null,
        updated_at: new Date().toISOString(),
      });

    // Calcular período
    const now = Math.floor(Date.now() / 1000);
    const timeFrom = now - periodDays * 24 * 60 * 60;
    const timeTo = now;

    console.log(`[Shopee Sync] Buscando pedidos de ${new Date(timeFrom * 1000).toISOString()} a ${new Date(timeTo * 1000).toISOString()} (${periodDays} dias)`);

    // Buscar todos os pedidos do período
    const orders = await getAllShopeeOrdersForPeriod({
      timeFrom,
      timeTo,
      fetchDetails: true,
      pageSize: 50,
      onProgress: ({ chunk, totalChunks, ordersLoaded }) => {
        console.log(`[Shopee Sync] Chunk ${chunk}/${totalChunks} - ${ordersLoaded} pedidos carregados`);
      },
    });

    console.log(`[Shopee Sync] Total de ${orders.length} pedidos obtidos da API`);

    if (orders.length === 0) {
      // Atualizar cursor mesmo sem pedidos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any)
        .from('shopee_sync_cursor')
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
    const ordersToUpsert = orders.map((o) => mapShopeeOrderToDb(o, shopId));
    const itemsToUpsert = orders.flatMap((o) => mapShopeeOrderItemsToDb(o));

    // Upsert de pedidos (em batches de 500)
    let ordersUpserted = 0;
    for (let i = 0; i < ordersToUpsert.length; i += 500) {
      const batch = ordersToUpsert.slice(i, i + 500);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: ordersError } = await (supabaseAdmin as any)
        .from('shopee_orders')
        .upsert(batch, {
          onConflict: 'order_sn',
          ignoreDuplicates: false, // Atualizar se existir
        });

      if (ordersError) {
        console.error(`[Shopee Sync] Erro ao upsert pedidos batch ${i / 500 + 1}:`, ordersError);
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
          .from('shopee_order_items')
          .upsert(batch, {
            onConflict: 'order_sn,item_id,model_id',
            ignoreDuplicates: false,
          });

        if (itemsError) {
          console.error(`[Shopee Sync] Erro ao upsert itens batch ${i / 500 + 1}:`, itemsError);
          // Não falhar por causa de itens, apenas logar
        } else {
          itemsUpserted += batch.length;
        }
      }
    }

    let escrowUpdated = 0;
    let escrowRequested = 0;
    if (includeEscrow && orders.length > 0) {
      try {
        const orderSnList = orders.map((o) => o.order_sn);
        const orderPayloadBySn = new Map<string, ShopeeOrder>();
        for (const order of orders) {
          orderPayloadBySn.set(order.order_sn, order);
        }

        const escrowPending: string[] = [];
        const rawPayloadBySn = new Map<string, unknown>();
        const BATCH_SIZE = 200;
        for (let i = 0; i < orderSnList.length; i += BATCH_SIZE) {
          const batch = orderSnList.slice(i, i + BATCH_SIZE);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existingRows } = await (supabaseAdmin as any)
            .from('shopee_orders')
            .select('order_sn, raw_payload, escrow_fetched_at')
            .in('order_sn', batch);

          (existingRows || []).forEach((row: any) => {
            rawPayloadBySn.set(row.order_sn, row.raw_payload);
            if (!row.escrow_fetched_at) {
              escrowPending.push(row.order_sn);
            }
          });
        }

        if (escrowPending.length > 0) {
          escrowRequested = escrowPending.length;
          const escrowMap = await getShopeeEscrowDetailsForOrders(escrowPending);
          for (const [orderSn, escrow] of escrowMap) {
            const basePayload =
              rawPayloadBySn.get(orderSn) ??
              orderPayloadBySn.get(orderSn) ??
              null;
            const nextRawPayload = mergeEscrowDetail(basePayload, escrow);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: updateError } = await (supabaseAdmin as any)
              .from('shopee_orders')
              .update({
                voucher_from_seller: escrow.voucher_from_seller,
                voucher_from_shopee: escrow.voucher_from_shopee,
                seller_voucher_code: escrow.seller_voucher_code,
                escrow_amount: escrow.escrow_amount,
                ams_commission_fee: escrow.ams_commission_fee,
                order_selling_price: escrow.order_selling_price,
                order_discounted_price: escrow.order_discounted_price,
                seller_discount: escrow.seller_discount,
                raw_payload: nextRawPayload,
                escrow_fetched_at: new Date().toISOString(),
              })
              .eq('order_sn', orderSn);

            if (!updateError) {
              escrowUpdated++;
            } else {
              console.error(`[Shopee Sync] Erro ao atualizar escrow ${orderSn}:`, updateError.message);
            }
          }
        }
      } catch (escrowError) {
        console.error('[Shopee Sync] Falha ao enriquecer escrow:', escrowError);
      }
    }

    // Encontrar o update_time mais recente
    const latestUpdateTime = orders.reduce((latest, o) => {
      return o.update_time > latest ? o.update_time : latest;
    }, 0);

    // Atualizar cursor de sync
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: cursorError } = await (supabaseAdmin as any)
      .from('shopee_sync_cursor')
      .update({
        sync_status: 'idle',
        last_sync_at: new Date().toISOString(),
        last_order_update_time: new Date(latestUpdateTime * 1000).toISOString(),
        total_orders_synced: ordersUpserted,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (cursorError) {
      console.error('[Shopee Sync] Erro ao atualizar cursor:', cursorError);
    }

    // Log de sucesso (sem usar sync_logs pois requer job_id)
    console.log(`[Shopee Sync] Concluído: ${ordersUpserted} pedidos, ${itemsUpserted} itens em ${Date.now() - startTime}ms`);

    return NextResponse.json({
      ok: true,
      data: {
        ordersProcessed: ordersUpserted,
        itemsProcessed: itemsUpserted,
        escrowRequested,
        escrowUpdated,
        periodDays,
        latestUpdateTime: new Date(latestUpdateTime * 1000).toISOString(),
        durationMs: Date.now() - startTime,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[Shopee Sync] Erro:', message);

    // Atualizar cursor com erro
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any)
      .from('shopee_sync_cursor')
      .update({
        sync_status: 'error',
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    // Log de erro (console apenas, sync_logs requer job_id)
    console.error(`[Shopee Sync] Falha: ${message} (duração: ${Date.now() - startTime}ms)`);

    // Verificar se é erro de configuração
    if (message.toLowerCase().includes('missing shopee')) {
      return NextResponse.json(
        { ok: false, error: { message: 'Shopee não configurada', code: 'SHOPEE_NOT_CONFIGURED' } },
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
 * Modo de ressincronização apenas de status.
 * Busca todos os pedidos do período no banco e atualiza apenas o status via API Shopee.
 * Útil para manter status atualizados sem refazer sync completo.
 */
async function handleStatusResyncOnly(periodDays: number, shopId: string, startTime: number) {
  console.log(`[Shopee StatusResync] Iniciando resync de status dos últimos ${periodDays} dias`);

  // Calcular período
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - periodDays);
  const cutoffISO = cutoffDate.toISOString();

  // Buscar todos os order_sn do período no banco
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingOrders, error: fetchError } = await (supabaseAdmin as any)
    .from('shopee_orders')
    .select('order_sn, order_status')
    .gte('create_time', cutoffISO)
    .eq('shop_id', parseInt(shopId, 10));

  if (fetchError) {
    console.error('[Shopee StatusResync] Erro ao buscar pedidos:', fetchError);
    throw new Error(`Erro ao buscar pedidos existentes: ${fetchError.message}`);
  }

  const orderSnList = existingOrders?.map((o: { order_sn: string }) => o.order_sn) || [];
  console.log(`[Shopee StatusResync] Encontrados ${orderSnList.length} pedidos para verificar status`);

  if (orderSnList.length === 0) {
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

  // Processar em batches de 50 (limite da API get_order_detail)
  let statusUpdated = 0;
  const statusChanges: Array<{ order_sn: string; from: string; to: string }> = [];

  for (let i = 0; i < orderSnList.length; i += STATUS_RESYNC_BATCH_SIZE) {
    const batch = orderSnList.slice(i, i + STATUS_RESYNC_BATCH_SIZE);
    const batchNum = Math.floor(i / STATUS_RESYNC_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(orderSnList.length / STATUS_RESYNC_BATCH_SIZE);
    
    console.log(`[Shopee StatusResync] Processando batch ${batchNum}/${totalBatches} (${batch.length} pedidos)`);

    try {
      // Buscar detalhes atuais da API
      const orderDetails = await getShopeeOrderDetails(batch);

      // Criar mapa de status atual no banco
      const existingStatusMap = new Map<string, string>(
        existingOrders
          .filter((o: { order_sn: string }) => batch.includes(o.order_sn))
          .map((o: { order_sn: string; order_status: string }) => [o.order_sn, o.order_status] as [string, string])
      );

      // Identificar pedidos com status diferente
      const updates: Array<{ order_sn: string; order_status: string; update_time: string }> = [];
      
      for (const order of orderDetails) {
        const currentStatus = existingStatusMap.get(order.order_sn);
        if (currentStatus !== order.order_status) {
          updates.push({
            order_sn: order.order_sn,
            order_status: order.order_status,
            update_time: new Date(order.update_time * 1000).toISOString(),
          });
          statusChanges.push({
            order_sn: order.order_sn,
            from: currentStatus || 'UNKNOWN',
            to: order.order_status,
          });
        }
      }

      // Atualizar status no banco
      if (updates.length > 0) {
        for (const update of updates) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updateError } = await (supabaseAdmin as any)
            .from('shopee_orders')
            .update({
              order_status: update.order_status,
              update_time: update.update_time,
            })
            .eq('order_sn', update.order_sn);

          if (updateError) {
            console.error(`[Shopee StatusResync] Erro ao atualizar ${update.order_sn}:`, updateError);
          } else {
            statusUpdated++;
          }
        }
      }

      // Rate limiting: pequeno delay entre batches
      if (i + STATUS_RESYNC_BATCH_SIZE < orderSnList.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (batchError) {
      console.error(`[Shopee StatusResync] Erro no batch ${batchNum}:`, batchError);
      // Continuar com próximo batch em vez de falhar completamente
    }
  }

  console.log(`[Shopee StatusResync] Concluído: ${orderSnList.length} verificados, ${statusUpdated} atualizados`);
  
  if (statusChanges.length > 0) {
    console.log('[Shopee StatusResync] Mudanças de status:', JSON.stringify(statusChanges.slice(0, 20)));
    if (statusChanges.length > 20) {
      console.log(`[Shopee StatusResync] ... e mais ${statusChanges.length - 20} mudanças`);
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      mode: 'statusResyncOnly',
      ordersChecked: orderSnList.length,
      statusUpdated,
      statusChanges: statusChanges.slice(0, 100), // Limitar resposta
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
      .from('shopee_sync_cursor')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: { message: error.message } }, { status: 500 });
    }

    // Contar pedidos no banco
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: totalOrders } = await (supabaseAdmin as any)
      .from('shopee_orders')
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
