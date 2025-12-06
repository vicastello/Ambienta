import { createClient } from '@supabase/supabase-js';
import { obterPedidoDetalhado } from '../lib/tinyApi';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugFrete() {
  const token = await supabase
    .from('tiny_tokens')
    .select('access_token')
    .eq('id', 1)
    .single();

  if (!token.data?.access_token) {
    console.error('Sem token');
    return;
  }

  // Pegar um pedido de hoje
  const numero = process.argv[2] ? Number(process.argv[2]) : null;

  const query = supabase
    .from('tiny_orders')
    .select('tiny_id, numero_pedido, raw')
    .gte('data_criacao', '2025-11-21')
    .order('numero_pedido', { ascending: false });

  const { data: order, error } = numero
    ? await query.eq('numero_pedido', numero).limit(1).single()
    : await query.limit(1).single();

  if (error) {
    console.error('Erro ao buscar pedido:', error.message);
    return;
  }

  if (!order) {
    console.log('Sem pedidos hoje');
    return;
  }

  console.log('\n🔍 INVESTIGANDO PEDIDO:', order.numero_pedido || order.tiny_id);
  console.log('='.repeat(60));

  // Buscar detalhes completos na API (log em tiny_api_usage)
  const json = await obterPedidoDetalhado(token.data.access_token, order.tiny_id, 'pedido_helper');
  console.log('\n📦 RESPOSTA COMPLETA DA API:');
  console.log(JSON.stringify(json, null, 2));

  console.log('\n🔍 CAMPOS DE FRETE:');
  console.log('valorFrete:', (json as any)?.valorFrete);
  console.log('frete:', (json as any)?.frete);
  console.log('transporte:', (json as any)?.transporte);
  console.log('transportador:', (json as any)?.transportador);

  if ((json as any)?.transportador) {
    console.log('\n📦 OBJETO TRANSPORTADOR:');
    console.log(JSON.stringify((json as any).transportador, null, 2));
  }

  console.log('\n💾 RAW ARMAZENADO NO BANCO:');
  if (order.raw) {
    console.log('order.raw.frete:', (order.raw as any)?.frete);
    console.log('order.raw.valorFrete:', (order.raw as any)?.valorFrete);
    console.log('order.raw.transporte:', (order.raw as any)?.transporte);
  } else {
    console.log('Sem raw no banco');
  }
}

debugFrete().catch(console.error);
