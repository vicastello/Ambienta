/**
 * Script para sincronização completa de 90 dias do Magalu (Nova API OAuth)
 * Uso: npx tsx scripts/magalu-sync-oauth.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const MAGALU_API_BASE = 'https://api.magalu.com';
const MAGALU_TOKEN_URL = 'https://id.magalu.com/oauth/token';

interface MagaluTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

async function getTokens(): Promise<MagaluTokens | null> {
  const { data, error } = await supabase
    .from('magalu_tokens')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    console.error('Tokens não encontrados:', error?.message);
    return null;
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
}

async function refreshTokens(refreshToken: string): Promise<string> {
  const clientId = process.env.MAGALU_CLIENT_ID;
  const clientSecret = process.env.MAGALU_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('MAGALU_CLIENT_ID e MAGALU_CLIENT_SECRET não configurados');
  }

  console.log('Renovando access_token...');

  const response = await fetch(MAGALU_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro ao renovar token: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Salvar novos tokens
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await supabase.from('magalu_tokens').upsert({
    id: 1,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  });

  console.log('Token renovado com sucesso!');
  return data.access_token;
}

async function getValidAccessToken(): Promise<string> {
  const tokens = await getTokens();

  if (!tokens) {
    throw new Error('Magalu não autenticado. Faça o fluxo OAuth primeiro em /api/magalu/oauth/auth');
  }

  // Verificar se precisa renovar
  const expiresAt = new Date(tokens.expires_at);
  const now = new Date();
  const marginMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - marginMs <= now.getTime()) {
    return await refreshTokens(tokens.refresh_token);
  }

  return tokens.access_token;
}

interface MagaluOrder {
  code: string;
  status: string;
  purchased_at?: string;
  approved_at?: string;
  updated_at?: string;
  created_at?: string;
  approved_at?: string;
  customer: {
    name: string;
    email?: string;
  };
  total: {
    order: number;
    freight: number;
    discount: number;
  };
  deliveries: Array<{
    type: string;
    estimate_delivery_date?: string;
    recipient: {
      name: string;
    };
    address: {
      city: string;
      state: string;
      street?: string;
      number?: string;
      neighborhood?: string;
      zip_code?: string;
    };
    items: Array<{
      code: string;
      sku: {
        code: string;
        name: string;
      };
      quantity: number;
      unit_price: {
        total: number;
        freight: number;
        discount: number;
      };
    }>;
  }>;
}

async function fetchOrders(accessToken: string, params: {
  limit: number;
  offset: number;
}): Promise<{ data: MagaluOrder[]; total: number }> {
  const searchParams = new URLSearchParams();
  searchParams.set('_limit', String(params.limit));
  searchParams.set('_offset', String(params.offset));

  const url = `${MAGALU_API_BASE}/seller/v1/orders?${searchParams}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro na API Magalu: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return {
    data: result.results || result.data || [],
    total: result.meta?.page?.count ?? (result.results?.length || result.data?.length || 0),
  };
}

function mapOrderToDb(order: MagaluOrder) {
  const delivery = order.deliveries?.[0];
  const address = delivery?.address;

  return {
    id_order: order.code,
    id_order_marketplace: order.code,
    order_status: order.status,
    marketplace_name: 'Magalu',
    purchased_date: order.purchased_at || order.created_at,
    approved_date: order.approved_at,
    updated_date: order.updated_at,
    estimated_delivery_date: delivery?.estimate_delivery_date,
    total_amount: order.total?.order || null,
    total_freight: order.total?.freight || null,
    total_discount: order.total?.discount || null,
    receiver_name: order.customer?.name || delivery?.recipient?.name,
    customer_mail: order.customer?.email,
    delivery_address_city: address?.city,
    delivery_address_state: address?.state,
    delivery_address_full: address
      ? `${address.street || ''} ${address.number || ''}, ${address.neighborhood || ''}, ${address.city || ''} - ${address.state || ''}, ${address.zip_code || ''}`
      : null,
    delivery_mode: delivery?.type,
    raw_payload: order,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mapItemsToDb(order: MagaluOrder) {
  const items = new Map<string, any>();

  for (const delivery of order.deliveries || []) {
    for (const item of delivery.items || []) {
      const pkg = Number((item as any).package_id ?? delivery.id ?? 0) || 0;
      const sku = item.sku?.code || item.code;
      const key = `${order.code}|${sku}|${pkg}`;
      const quantity = item.quantity || 1;
      const price = item.unit_price?.total || 0;
      const freight = item.unit_price?.freight || 0;
      const discount = item.unit_price?.discount || 0;

      if (items.has(key)) {
        const curr = items.get(key);
        curr.quantity += quantity;
        curr.freight += freight;
        curr.discount += discount;
      } else {
        items.set(key, {
          id_order: order.code,
          id_sku: sku,
          id_order_package: pkg,
          product_name: item.sku?.name || '',
          quantity,
          price,
          freight,
          discount,
          raw_payload: item,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  return Array.from(items.values());
}

async function main() {
  console.log('============================================================');
  console.log('MAGALU - Sincronização OAuth 2.0 (90 dias)');
  console.log('============================================================\n');

  try {
    const accessToken = await getValidAccessToken();
    console.log('✓ Token de acesso válido\n');

    // Calcular período
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 90);

    console.log(`Período (referência): ${fromDate.toISOString().split('T')[0]} a ${toDate.toISOString().split('T')[0]} (fetch sem filtro por data na API)\n`);

    // Buscar todos os pedidos com paginação
    const allOrders: MagaluOrder[] = [];
    const limit = 100;
    let offset = 0;
    while (true) {
      const result = await fetchOrders(accessToken, {
        limit,
        offset,
      });

      if ((result.data || []).length === 0) {
        break;
      }

      allOrders.push(...result.data);
      offset += limit;

      console.log(`Carregados: ${allOrders.length} pedidos (última página trouxe ${result.data.length})`);

      // Rate limiting
      if (result.data.length < limit) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`\n✓ Total de ${allOrders.length} pedidos obtidos da API\n`);

    if (allOrders.length === 0) {
      console.log('Nenhum pedido encontrado no período.');
      return;
    }

    // Preparar dados
    const ordersToUpsert = allOrders.map(mapOrderToDb);
    const itemsToUpsert = allOrders.flatMap(mapItemsToDb);

    // Upsert de pedidos
    console.log('Salvando pedidos no banco...');
    let ordersUpserted = 0;
    for (let i = 0; i < ordersToUpsert.length; i += 500) {
      const batch = ordersToUpsert.slice(i, i + 500);
      const { error } = await supabase
        .from('magalu_orders')
        .upsert(batch, { onConflict: 'id_order' });

      if (error) {
        console.error(`Erro no batch ${i / 500 + 1}:`, error.message);
      } else {
        ordersUpserted += batch.length;
        console.log(`  Batch ${Math.floor(i / 500) + 1}: ${batch.length} pedidos`);
      }
    }

    // Upsert de itens
    console.log('\nSalvando itens no banco...');
    let itemsUpserted = 0;
    for (let i = 0; i < itemsToUpsert.length; i += 500) {
      const batch = itemsToUpsert.slice(i, i + 500);
      const { error } = await supabase
        .from('magalu_order_items')
        .upsert(batch as never[], { onConflict: 'id_order,id_sku,id_order_package' });

      if (error) {
        console.error(`Erro no batch ${i / 500 + 1}:`, error.message);
      } else {
        itemsUpserted += batch.length;
      }
    }

    // Atualizar cursor
    await supabase.from('magalu_sync_cursor').upsert({
      id: 1,
      sync_status: 'idle',
      last_sync_at: new Date().toISOString(),
      total_orders_synced: ordersUpserted,
      updated_at: new Date().toISOString(),
    });

    console.log('\n============================================================');
    console.log(`✓ Pedidos salvos: ${ordersUpserted}`);
    console.log(`✓ Itens salvos: ${itemsUpserted}`);
    console.log('============================================================');

  } catch (error) {
    console.error('\n❌ Erro:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
