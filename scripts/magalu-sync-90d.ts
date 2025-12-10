#!/usr/bin/env npx tsx
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Carregar .env.local
config({ path: '.env.local' });

const MAGALU_BASE_URL = 'https://api.magalu.com/seller/v1';

// Configuração
const accessToken = process.env.MAGALU_ACCESS_TOKEN!;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!accessToken) {
  console.error('❌ MAGALU_ACCESS_TOKEN não configurado');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface MagaluOrder {
  IdOrder: string;
  IdOrderMarketplace?: string;
  OrderStatus: string;
  MarketplaceName?: string;
  StoreName?: string;
  InsertedDate?: string;
  PurchasedDate?: string;
  ApprovedDate?: string;
  UpdatedDate?: string;
  EstimatedDeliveryDate?: string;
  TotalAmount?: string;
  TotalFreight?: string;
  TotalDiscount?: string;
  ReceiverName?: string;
  CustomerMail?: string;
  DeliveryAddressCity?: string;
  DeliveryAddressState?: string;
  DeliveryAddressFull?: string;
  Products?: Array<{
    IdSku: string;
    IdOrderPackage?: number;
    ProductName?: string;
    Quantity?: number;
    Price?: string;
    Freight?: string;
    Discount?: string;
  }>;
}

interface MagaluOrdersResponse {
  Orders: MagaluOrder[];
  Page: number;
  PerPage: number;
  Total: number;
}

async function magaluRequest(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${MAGALU_BASE_URL}${path}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  console.log(`[Magalu] Request: ${path} (page ${params.page || 1})`);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.json();
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCityState(city: string | undefined, state: string | undefined): { city: string | null; state: string | null } {
  return {
    city: city || null,
    state: state || null,
  };
}

function mapOrderToDb(order: MagaluOrder) {
  const { city, state } = extractCityState(order.DeliveryAddressCity, order.DeliveryAddressState);

  return {
    id_order: order.IdOrder,
    id_order_marketplace: order.IdOrderMarketplace || null,
    order_status: order.OrderStatus,
    marketplace_name: order.MarketplaceName || 'Magalu',
    store_name: order.StoreName || null,
    inserted_date: order.InsertedDate || null,
    purchased_date: order.PurchasedDate || null,
    approved_date: order.ApprovedDate || null,
    updated_date: order.UpdatedDate || null,
    estimated_delivery_date: order.EstimatedDeliveryDate || null,
    total_amount: order.TotalAmount ? parseFloat(order.TotalAmount) : null,
    total_freight: order.TotalFreight ? parseFloat(order.TotalFreight) : null,
    total_discount: order.TotalDiscount ? parseFloat(order.TotalDiscount) : null,
    receiver_name: order.ReceiverName || null,
    customer_mail: order.CustomerMail || null,
    delivery_address_city: city,
    delivery_address_state: state,
    delivery_address_full: order.DeliveryAddressFull || null,
    raw_payload: order,
    synced_at: new Date().toISOString(),
  };
}

function mapItemsToDb(order: MagaluOrder): any[] {
  if (!order.Products?.length) return [];

  return order.Products.map((item) => ({
    id_order: order.IdOrder,
    id_sku: item.IdSku,
    id_order_package: item.IdOrderPackage || null,
    product_name: item.ProductName || null,
    quantity: item.Quantity || 1,
    price: item.Price ? parseFloat(item.Price) : null,
    freight: item.Freight ? parseFloat(item.Freight) : null,
    discount: item.Discount ? parseFloat(item.Discount) : null,
    raw_payload: item,
  }));
}

async function syncPage(page: number, perPage: number = 100): Promise<{ orders: MagaluOrder[]; hasMore: boolean; total: number }> {
  try {
    const response: MagaluOrdersResponse = await magaluRequest('/orders', {
      page: String(page),
      limit: String(perPage),
    });

    const orders = response.Orders || [];
    const total = response.Total || 0;
    const currentCount = page * perPage;
    const hasMore = currentCount < total;

    console.log(`  Página ${page}: ${orders.length} pedidos (${currentCount}/${total})`);

    return {
      orders,
      hasMore,
      total,
    };
  } catch (err: any) {
    console.error(`  Erro na página ${page}: ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('MAGALU SYNC - Últimos 90 dias');
  console.log('='.repeat(60));

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);

  console.log(`\nPeríodo: ${startDate.toISOString().split('T')[0]} → ${new Date().toISOString().split('T')[0]}`);
  console.log(`Nota: API Magalu não possui filtro de data, buscando todos os pedidos recentes\n`);

  let page = 1;
  let hasMore = true;
  let totalOrders = 0;
  const allOrders: MagaluOrder[] = [];

  // 1. Buscar todos os pedidos (paginação)
  while (hasMore) {
    try {
      const result = await syncPage(page, 100);

      allOrders.push(...result.orders);
      totalOrders = result.total;
      hasMore = result.hasMore;

      if (hasMore) {
        page++;
        await sleep(500); // Rate limiting
      }
    } catch (err: any) {
      console.error(`Erro fatal ao buscar página ${page}: ${err.message}`);
      break;
    }
  }

  if (allOrders.length === 0) {
    console.log('\n⚠️  Nenhum pedido encontrado');
    return;
  }

  console.log(`\n✓ Total de ${allOrders.length} pedidos coletados`);

  // 2. Filtrar últimos 90 dias
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  const recentOrders = allOrders.filter(order => {
    const orderDate = new Date(order.PurchasedDate || order.InsertedDate || 0);
    return orderDate >= cutoffDate;
  });

  console.log(`✓ ${recentOrders.length} pedidos nos últimos 90 dias`);

  // 3. Mapear para formato do banco
  const ordersToUpsert = recentOrders.map(mapOrderToDb);
  const itemsToUpsert = recentOrders.flatMap(mapItemsToDb);

  // 4. Upsert pedidos em batches
  console.log('\n📥 Salvando pedidos no banco...');
  for (let i = 0; i < ordersToUpsert.length; i += 500) {
    const batch = ordersToUpsert.slice(i, i + 500);
    const { error } = await supabase
      .from('magalu_orders')
      .upsert(batch, { onConflict: 'id_order' });

    if (error) {
      console.error(`  ❌ Erro ao salvar pedidos (batch ${Math.floor(i/500)+1}): ${error.message}`);
    } else {
      console.log(`  ✓ Batch ${Math.floor(i/500)+1}: ${batch.length} pedidos salvos`);
    }
  }

  // 5. Upsert itens em batches
  if (itemsToUpsert.length > 0) {
    console.log('\n📦 Salvando itens no banco...');
    for (let i = 0; i < itemsToUpsert.length; i += 500) {
      const batch = itemsToUpsert.slice(i, i + 500);
      const { error } = await supabase
        .from('magalu_order_items')
        .upsert(batch, { onConflict: 'id_order,id_sku,id_order_package' });

      if (error) {
        console.error(`  ❌ Erro ao salvar itens (batch ${Math.floor(i/500)+1}): ${error.message}`);
      } else {
        console.log(`  ✓ Batch ${Math.floor(i/500)+1}: ${batch.length} itens salvos`);
      }
    }
  }

  // 6. Atualizar cursor
  await supabase
    .from('magalu_sync_cursor')
    .upsert({
      id: 1,
      sync_status: 'idle',
      last_sync_at: new Date().toISOString(),
      total_orders_synced: recentOrders.length,
      updated_at: new Date().toISOString(),
    });

  console.log('\n' + '='.repeat(60));
  console.log(`✅ CONCLUÍDO: ${recentOrders.length} pedidos, ${itemsToUpsert.length} itens sincronizados`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
