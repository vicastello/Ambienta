/**
 * Script para ressincronizar STATUS dos pedidos Shopee dos últimos 90 dias
 * Atualiza apenas o status, não recria os pedidos
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
    order_list?: Array<{
      order_sn: string;
      order_status: string;
      update_time: number;
    }>;
  };
}

async function getOrderDetails(orderSns: string[]): Promise<Array<{ order_sn: string; order_status: string; update_time: number }>> {
  if (orderSns.length === 0) return [];
  
  const response = await shopeeRequest<OrderDetailResponse>('/order/get_order_detail', {
    order_sn_list: orderSns.join(','),
    response_optional_fields: 'order_status',
  });

  return response.response?.order_list || [];
}

async function main() {
  console.log('='.repeat(60));
  console.log('SHOPEE - Ressincronização de STATUS (90 dias)');
  console.log('='.repeat(60));

  // Buscar todos os pedidos dos últimos 90 dias que NÃO estão COMPLETED ou CANCELLED
  // (esses são status finais que não mudam)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: pendingOrders, error } = await (supabase as any)
    .from('shopee_orders')
    .select('order_sn, order_status')
    .gte('create_time', ninetyDaysAgo.toISOString())
    .not('order_status', 'in', '(COMPLETED,CANCELLED)');

  if (error) {
    console.error('Erro ao buscar pedidos:', error);
    return;
  }

  if (!pendingOrders?.length) {
    console.log('\nNenhum pedido pendente para atualizar.');
    return;
  }

  console.log(`\nPedidos pendentes a verificar: ${pendingOrders.length}`);
  console.log('Status atuais:', 
    Object.entries(
      pendingOrders.reduce((acc: Record<string, number>, o: any) => {
        acc[o.order_status] = (acc[o.order_status] || 0) + 1;
        return acc;
      }, {})
    ).map(([k, v]) => `${k}: ${v}`).join(', ')
  );

  console.log('\nBuscando status atualizados na API Shopee...\n');

  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  const orderSns = pendingOrders.map((o: any) => o.order_sn);
  const statusMap = new Map(pendingOrders.map((o: any) => [o.order_sn, o.order_status]));

  // Processar em batches de 50
  for (let i = 0; i < orderSns.length; i += 50) {
    const batch = orderSns.slice(i, i + 50);
    const batchNum = Math.floor(i / 50) + 1;
    const totalBatches = Math.ceil(orderSns.length / 50);
    
    process.stdout.write(`Batch ${batchNum}/${totalBatches}... `);

    try {
      const details = await getOrderDetails(batch);

      for (const order of details) {
        const currentStatus = statusMap.get(order.order_sn);
        
        // Normalizar status (PROCESSED -> READY_TO_SHIP)
        let newStatus = order.order_status;
        if (newStatus === 'PROCESSED') {
          newStatus = 'READY_TO_SHIP';
        }

        if (currentStatus !== newStatus) {
          const { error: updateError } = await (supabase as any)
            .from('shopee_orders')
            .update({
              order_status: newStatus,
              update_time: new Date(order.update_time * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('order_sn', order.order_sn);

          if (updateError) {
            errors++;
          } else {
            updated++;
          }
        } else {
          unchanged++;
        }
      }

      console.log(`✓ (${updated} atualizados)`);
    } catch (err: any) {
      console.log(`ERRO: ${err.message}`);
      errors++;
    }

    await sleep(300);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Atualizados: ${updated}`);
  console.log(`Sem mudança: ${unchanged}`);
  console.log(`Erros: ${errors}`);
  console.log('='.repeat(60));

  // Verificar nova distribuição
  console.log('\nNova distribuição de status:');
  const { data: allOrders } = await (supabase as any)
    .from('shopee_orders')
    .select('order_status');

  const statusCount: Record<string, number> = {};
  allOrders?.forEach((o: any) => {
    statusCount[o.order_status] = (statusCount[o.order_status] || 0) + 1;
  });

  Object.entries(statusCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
