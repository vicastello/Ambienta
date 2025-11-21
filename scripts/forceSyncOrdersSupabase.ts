/**
 * Força sincronização de pedidos via cron do Supabase
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";

async function forceSyncOrders() {
  console.log('🔄 Forçando sincronização de pedidos...\n');

  try {
    // Tentar executar a função de sync diretamente
    const { data, error } = await supabaseAdmin
      .rpc('sync_tiny_orders_efficient')
      .single();

    if (error) {
      console.error('❌ Erro ao executar sync:', error.message);
      console.log('\nTente executar manualmente no SQL Editor:');
      console.log('  SELECT * FROM sync_tiny_orders_efficient();\n');
      return;
    }

    console.log('✅ Sincronização executada com sucesso!');
    console.log('Resultado:', data);

    // Verificar último pedido após sync
    const { data: lastOrder } = await supabaseAdmin
      .from('tiny_orders')
      .select('numero_pedido, data_criacao, updated_at, situacao')
      .order('numero_pedido', { ascending: false })
      .limit(10);

    console.log('\n📦 Últimos 10 pedidos após sync:');
    lastOrder?.forEach(o => {
      console.log(`   #${o.numero_pedido} | ${o.data_criacao} | ${o.situacao} | ${o.updated_at}`);
    });

  } catch (error: any) {
    console.error('❌ Erro:', error.message);
  }
}

forceSyncOrders().catch(console.error);
