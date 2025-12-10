/**
 * Script para enriquecer pedidos da Shopee com cidade/estado
 * extraídos do tracking info (último centro logístico de entrega)
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

// Extrai cidade/estado do tracking info
function extractLocationFromTracking(trackingInfo: any[]): { city: string | null; state: string | null } {
  if (!trackingInfo?.length) return { city: null, state: null };

  // Padrões para extrair cidade/estado
  const patterns = [
    // "Seu pedido chegou ao último centro logístico: Guaratinguetá - SP"
    /último centro logístico:\s*([^-]+)\s*-\s*([A-Z]{2})/i,
    // "Pedido entregue em Cidade - UF"
    /entregue.*?:\s*([^-]+)\s*-\s*([A-Z]{2})/i,
    // "rota de entrega para Cidade - UF"
    /entrega.*?para\s+([^-]+)\s*-\s*([A-Z]{2})/i,
    // "chegou ao centro logístico: Cidade - UF" (qualquer centro)
    /centro logístico:\s*([^-]+)\s*-\s*([A-Z]{2})/i,
    // "Pedido postado Cidade - UF"
    /postado\s+([^-]+)\s*-\s*([A-Z]{2})/i,
  ];

  // Prioriza "último centro logístico" pois é o destino
  for (const event of trackingInfo) {
    const desc = event.description || '';
    
    // Primeiro tenta encontrar o último centro (destino)
    const ultimoMatch = desc.match(/último centro logístico:\s*([^-]+)\s*-\s*([A-Z]{2})/i);
    if (ultimoMatch) {
      return {
        city: ultimoMatch[1].trim(),
        state: ultimoMatch[2].toUpperCase(),
      };
    }
  }

  // Se não encontrou último centro, procura outros padrões
  for (const event of trackingInfo) {
    const desc = event.description || '';
    
    for (const pattern of patterns) {
      const match = desc.match(pattern);
      if (match) {
        return {
          city: match[1].trim(),
          state: match[2].toUpperCase(),
        };
      }
    }
  }

  return { city: null, state: null };
}

interface TrackingResponse {
  response?: {
    tracking_info?: Array<{
      description: string;
      update_time: number;
      logistics_status: string;
    }>;
  };
}

async function getTrackingInfo(orderSn: string): Promise<any[]> {
  try {
    const response = await shopeeRequest<TrackingResponse>('/logistics/get_tracking_info', {
      order_sn: orderSn,
    });
    return response.response?.tracking_info || [];
  } catch (err: any) {
    // Ignora erros - pedido pode não ter tracking
    return [];
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('SHOPEE - Enriquecimento via Tracking Info');
  console.log('='.repeat(60));

  // Buscar pedidos COMPLETED sem cidade/estado
  const { data: orders, error } = await (supabase as any)
    .from('shopee_orders')
    .select('order_sn')
    .is('recipient_city', null)
    .in('order_status', ['COMPLETED', 'SHIPPED', 'TO_RETURN']) // Só pedidos com tracking
    .order('create_time', { ascending: false })
    .limit(500);

  if (error) {
    console.error('Erro ao buscar pedidos:', error);
    return;
  }

  if (!orders?.length) {
    console.log('Nenhum pedido para enriquecer.');
    return;
  }

  console.log(`\nEnriquecendo ${orders.length} pedidos via tracking...\n`);

  let enriched = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < orders.length; i++) {
    const { order_sn } = orders[i];
    
    if ((i + 1) % 50 === 0) {
      console.log(`\n--- Progresso: ${i + 1}/${orders.length} (${enriched} enriquecidos) ---\n`);
    }

    process.stdout.write(`[${i + 1}/${orders.length}] ${order_sn}... `);

    try {
      const trackingInfo = await getTrackingInfo(order_sn);
      const { city, state } = extractLocationFromTracking(trackingInfo);

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
          errors++;
        } else {
          console.log(`✓ ${city || '?'} / ${state || '?'}`);
          enriched++;
        }
      } else {
        console.log('sem tracking');
        notFound++;
      }
    } catch (err: any) {
      console.log(`ERRO: ${err.message}`);
      errors++;
    }

    // Rate limit - 300ms entre requests
    await sleep(300);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Enriquecidos: ${enriched}`);
  console.log(`Sem tracking disponível: ${notFound}`);
  console.log(`Erros: ${errors}`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
