import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAllShopeeOrdersForPeriod } from '@/lib/shopeeClient';
import type { ShopeeOrder } from '@/src/types/shopee';

const DEFAULT_PERIOD_DAYS = 90; // Sync inicial: 90 dias
const INCREMENTAL_PERIOD_DAYS = 3; // Sync incremental: 3 dias

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
  
  return {
    order_sn: order.order_sn,
    shop_id: parseInt(shopId, 10),
    order_status: order.order_status,
    create_time: new Date(order.create_time * 1000).toISOString(),
    update_time: new Date(order.update_time * 1000).toISOString(),
    currency: order.currency || 'BRL',
    total_amount: parseFloat(order.total_amount) || 0,
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
  if (!order.order_items?.length) return [];
  
  return order.order_items.map((item) => ({
    order_sn: order.order_sn,
    item_id: item.item_id,
    model_id: item.model_id || null,
    item_name: item.item_name,
    model_name: item.model_name || null,
    item_sku: item.item_sku || null,
    model_sku: item.model_sku || null,
    quantity: 1, // Shopee não retorna quantidade no get_order_list, sempre 1 por linha
    original_price: parseFloat(item.variation_original_price) || null,
    discounted_price: parseFloat(item.variation_discounted_price) || null,
    is_wholesale: item.is_wholesale || false,
    raw_payload: item as unknown as Record<string, unknown>,
  }));
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
    try {
      const body = await req.json();
      if (body.periodDays && typeof body.periodDays === 'number') {
        periodDays = Math.min(body.periodDays, 180); // Máximo 180 dias
      }
      if (body.initial === true) {
        periodDays = DEFAULT_PERIOD_DAYS; // Sync inicial completo
      }
    } catch {
      // Body vazio ou inválido, usar padrão
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
