/**
 * Script para enriquecer pedidos da Shopee com dados de logística
 * A API get_order_detail mascara endereços, mas escrow_detail pode ter mais informações
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

// Busca escrow_detail que pode ter informações de endereço
async function getEscrowDetail(orderSn: string): Promise<any> {
  try {
    const response = await shopeeRequest<any>('/payment/get_escrow_detail', {
      order_sn: orderSn,
    });
    return response.response;
  } catch (err: any) {
    console.error(`  Erro escrow ${orderSn}: ${err.message}`);
    return null;
  }
}

// Busca shipping parameter que pode ter endereço de entrega
async function getShippingParameter(orderSn: string): Promise<any> {
  try {
    const response = await shopeeRequest<any>('/logistics/get_shipping_parameter', {
      order_sn: orderSn,
    });
    return response.response;
  } catch (err: any) {
    // Ignora erro - nem todos pedidos têm esse dado
    return null;
  }
}

// Extrai cidade/estado de vários formatos possíveis
function extractLocation(data: any): { city: string | null; state: string | null } {
  // Tenta várias estruturas
  const sources = [
    data?.buyer_address_name,
    data?.recipient_address?.city,
    data?.recipient_address?.state,
    data?.shipping_address?.city,
    data?.shipping_address?.state,
    data?.address_info?.city,
    data?.address_info?.state,
  ];

  let city = null;
  let state = null;

  // Procura em recipient_address
  if (data?.recipient_address) {
    const addr = data.recipient_address;
    if (addr.city && addr.city !== '****') city = addr.city;
    if (addr.state && addr.state !== '****') state = addr.state;
  }

  // Procura em shipping_address
  if (data?.shipping_address) {
    const addr = data.shipping_address;
    if (!city && addr.city && addr.city !== '****') city = addr.city;
    if (!state && addr.state && addr.state !== '****') state = addr.state;
  }

  return { city, state };
}

async function main() {
  console.log('='.repeat(60));
  console.log('SHOPEE - Enriquecimento de dados de localização');
  console.log('='.repeat(60));

  // Buscar pedidos sem cidade/estado
  const { data: orders, error } = await (supabase as any)
    .from('shopee_orders')
    .select('order_sn')
    .is('recipient_city', null)
    .eq('order_status', 'COMPLETED') // Só pedidos concluídos
    .order('create_time', { ascending: false })
    .limit(100); // Processa em batches

  if (error) {
    console.error('Erro ao buscar pedidos:', error);
    return;
  }

  if (!orders?.length) {
    console.log('Nenhum pedido sem cidade para enriquecer.');
    return;
  }

  console.log(`\nEnriquecendo ${orders.length} pedidos...\n`);

  let enriched = 0;
  let notFound = 0;

  for (let i = 0; i < orders.length; i++) {
    const { order_sn } = orders[i];
    process.stdout.write(`[${i + 1}/${orders.length}] ${order_sn}... `);

    // Tenta escrow_detail
    const escrowData = await getEscrowDetail(order_sn);
    await sleep(200);

    let { city, state } = extractLocation(escrowData);

    // Se não encontrou, tenta shipping_parameter
    if (!city && !state) {
      const shippingData = await getShippingParameter(order_sn);
      await sleep(200);
      const loc = extractLocation(shippingData);
      city = loc.city;
      state = loc.state;
    }

    if (city || state) {
      const { error: updateError } = await (supabase as any)
        .from('shopee_orders')
        .update({
          recipient_city: city,
          recipient_state: state,
          updated_at: new Date().toISOString(),
        })
        .eq('order_sn', order_sn);

      if (updateError) {
        console.log(`ERRO: ${updateError.message}`);
      } else {
        console.log(`✓ ${city || '?'} / ${state || '?'}`);
        enriched++;
      }
    } else {
      console.log('sem dados');
      notFound++;
    }

    // Rate limit
    await sleep(300);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Enriquecidos: ${enriched}`);
  console.log(`Sem dados disponíveis: ${notFound}`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
