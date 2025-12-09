/**
 * Script para buscar itens faltantes dos pedidos da Shopee
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SHOPEE_BASE_URL = 'https://partner.shopeemobile.com';

const partnerId = process.env.SHOPEE_PARTNER_ID!;
const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
const shopId = process.env.SHOPEE_SHOP_ID!;
const accessToken = process.env.SHOPEE_ACCESS_TOKEN!;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateSignature(path: string, timestamp: number): string {
  const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
  const hmac = crypto.createHmac('sha256', partnerKey);
  hmac.update(baseString);
  return hmac.digest('hex');
}

async function shopeeRequest<T>(apiPath: string, params: Record<string, string | number>): Promise<T> {
  const fullPath = `/api/v2${apiPath}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSignature(fullPath, timestamp);

  const url = new URL(SHOPEE_BASE_URL + fullPath);
  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('shop_id', shopId);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.error && data.error !== '' && data.error !== 0) {
    throw new Error(`Shopee error: ${data.message || data.error}`);
  }

  return data as T;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface OrderDetailResponse {
  response?: {
    order_list?: any[];
  };
}

async function getOrderDetails(orderSns: string[]): Promise<any[]> {
  if (orderSns.length === 0) return [];
  
  const response = await shopeeRequest<OrderDetailResponse>('/order/get_order_detail', {
    order_sn_list: orderSns.join(','),
    response_optional_fields: 'item_list',
  });

  return response.response?.order_list || [];
}

function mapItemsToDb(order: any): any[] {
  if (!order.item_list?.length) return [];
  
  return order.item_list.map((item: any) => ({
    order_sn: order.order_sn,
    item_id: item.item_id,
    model_id: item.model_id || null,
    item_name: item.item_name,
    model_name: item.model_name || null,
    item_sku: item.item_sku || null,
    model_sku: item.model_sku || null,
    quantity: item.model_quantity_purchased || 1,
    original_price: parseFloat(item.model_original_price) || null,
    discounted_price: parseFloat(item.model_discounted_price) || null,
    is_wholesale: item.wholesale || false,
    raw_payload: item,
  }));
}

async function main() {
  console.log('='.repeat(60));
  console.log('SHOPEE - Buscar itens faltantes');
  console.log('='.repeat(60));

  // Buscar TODOS os pedidos (paginando)
  const allOrderSns: string[] = [];
  let offset = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data: batch } = await (supabase as any)
      .from('shopee_orders')
      .select('order_sn')
      .range(offset, offset + pageSize - 1);
    
    if (!batch?.length) break;
    allOrderSns.push(...batch.map((o: any) => o.order_sn));
    offset += pageSize;
    if (batch.length < pageSize) break;
  }

  // Buscar TODOS os order_sn que já têm itens
  const itemOrderSns = new Set<string>();
  offset = 0;
  
  while (true) {
    const { data: batch } = await (supabase as any)
      .from('shopee_order_items')
      .select('order_sn')
      .range(offset, offset + pageSize - 1);
    
    if (!batch?.length) break;
    batch.forEach((i: any) => itemOrderSns.add(i.order_sn));
    offset += pageSize;
    if (batch.length < pageSize) break;
  }

  const orderSns = new Set(allOrderSns);
  const semItens = [...orderSns].filter(sn => !itemOrderSns.has(sn));

  console.log(`\nPedidos totais: ${orderSns.size}`);
  console.log(`Pedidos com itens: ${itemOrderSns.size}`);
  console.log(`Pedidos SEM itens: ${semItens.length}`);

  if (semItens.length === 0) {
    console.log('\nTodos os pedidos já têm itens!');
    return;
  }

  console.log(`\nBuscando itens para ${semItens.length} pedidos...\n`);

  let totalItens = 0;
  let errors = 0;

  // Processar em batches de 50
  for (let i = 0; i < semItens.length; i += 50) {
    const batch = semItens.slice(i, i + 50);
    console.log(`Batch ${Math.floor(i / 50) + 1}/${Math.ceil(semItens.length / 50)} (${batch.length} pedidos)...`);

    try {
      const orders = await getOrderDetails(batch);
      const items = orders.flatMap(mapItemsToDb);

      if (items.length > 0) {
        // Inserir um a um para evitar conflitos de duplicação
        let saved = 0;
        for (const item of items) {
          const { error } = await (supabase as any)
            .from('shopee_order_items')
            .upsert(item, { onConflict: 'order_sn,item_id,model_id', ignoreDuplicates: true });

          if (!error) saved++;
        }
        console.log(`  ✓ ${saved}/${items.length} itens salvos`);
        totalItens += saved;
      } else {
        console.log(`  Nenhum item encontrado`);
      }
    } catch (err: any) {
      console.error(`  ERRO: ${err.message}`);
      errors++;
    }

    await sleep(300);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Total de itens inseridos: ${totalItens}`);
  console.log(`Erros: ${errors}`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
