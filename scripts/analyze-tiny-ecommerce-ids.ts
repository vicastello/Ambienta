/**
 * Script para analisar como o Tiny armazena IDs de pedidos dos marketplaces
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function analyzeTinyEcommerceIds() {
  console.log('Analisando IDs de e-commerce no Tiny...\n');

  // Buscar pedidos do Tiny que têm canal de marketplace
  const { data: tinyOrders, error } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, canal, raw_payload')
    .in('canal', ['Shopee', 'Mercado Livre', 'Magalu'])
    .not('raw_payload', 'is', null)
    .limit(10);

  if (error) {
    console.error('Erro ao buscar pedidos:', error);
    return;
  }

  console.log(`Encontrados ${tinyOrders?.length || 0} pedidos\n`);

  for (const order of tinyOrders || []) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Pedido Tiny #${order.numero_pedido} (ID: ${order.id})`);
    console.log(`Canal: ${order.canal}`);
    console.log(`${'='.repeat(80)}\n`);

    const raw = order.raw_payload as any;

    // Analisar estrutura do raw_payload
    console.log('Campos no raw_payload:');
    console.log('  - id:', raw?.id);
    console.log('  - numero:', raw?.numero);
    console.log('  - numero_ecommerce:', raw?.numero_ecommerce);
    console.log('  - id_pedido_ecommerce:', raw?.id_pedido_ecommerce);
    console.log('  - ecommerce:', JSON.stringify(raw?.ecommerce, null, 2));
    console.log('  - marcadores:', raw?.marcadores);

    console.log('\nRaw payload completo (primeiros campos):');
    console.log(JSON.stringify(Object.keys(raw || {}).slice(0, 20), null, 2));

    // Tentar extrair ID do marketplace
    const possibleIds = {
      numero_ecommerce: raw?.numero_ecommerce,
      id_pedido_ecommerce: raw?.id_pedido_ecommerce,
      ecommerce_numero: raw?.ecommerce?.numero,
      ecommerce_id: raw?.ecommerce?.id,
      numero_pedido: raw?.numero_pedido,
      id: raw?.id,
    };

    console.log('\nPossíveis IDs do marketplace:');
    for (const [key, value] of Object.entries(possibleIds)) {
      if (value) {
        console.log(`  ${key}: ${value}`);
      }
    }
  }
}

analyzeTinyEcommerceIds()
  .then(() => {
    console.log('\n\nAnálise concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
