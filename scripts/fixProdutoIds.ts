#!/usr/bin/env tsx
/**
 * Fix missing id_produto_tiny in tiny_pedido_itens
 * Re-fetches items for recent orders to capture produto.id properly
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://znoiauhdrujwkfryhwiz.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpub2lhdWhkcnVqd2tmcnlod2l6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzM5ODEyNywiZXhwIjoyMDc4OTc0MTI3fQ.J1GFCdU1Fb9Jc5NlQSHkI7vsvXPWbE3l6h-17KLPsZQ';

export {};

async function main() {
  const { supabaseAdmin } = await import('../lib/supabaseAdmin');
  const { getAccessTokenFromDbOrRefresh } = await import('../lib/tinyAuth');
  const { obterPedidoDetalhado } = await import('../lib/tinyApi');

  console.log('🔧 Fixing produto IDs in pedido_itens...\n');

  const accessToken = await getAccessTokenFromDbOrRefresh();

  // Get recent orders
  const dataMin = new Date();
  dataMin.setDate(dataMin.getDate() - 30); // Last 30 days

  const { data: orders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido')
    .gte('data_criacao', dataMin.toISOString().slice(0, 10))
    .order('data_criacao', { ascending: false });

  console.log(`📋 Found ${orders?.length || 0} orders to check\n`);

  let processed = 0;
  let fixed = 0;
  let skipped = 0;

  for (const order of orders || []) {
    // Check if items exist and need fixing
    const { data: existingItems } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id, id_produto_tiny')
      .eq('id_pedido', order.id);

    if (!existingItems || existingItems.length === 0) {
      console.log(`⏭️  #${order.numero_pedido} - no items yet`);
      skipped++;
      continue;
    }

    const needsFix = existingItems.some(item => !item.id_produto_tiny);
    if (!needsFix) {
      skipped++;
      continue;
    }

    try {
      // Fetch detailed order
      const detalhado = await obterPedidoDetalhado(accessToken, order.tiny_id);
      const itens = detalhado.itens || [];

      if (itens.length === 0) {
        console.log(`⚠️  #${order.numero_pedido} - no items in API response`);
        continue;
      }

      // Delete old items and re-insert with proper produto IDs
      await supabaseAdmin
        .from('tiny_pedido_itens')
        .delete()
        .eq('id_pedido', order.id);

      const newItems = itens.map((item: any) => {
        const produto = item.produto || item;
        return {
          id_pedido: order.id,
          id_produto_tiny: produto.id || item.idProduto || null,
          codigo_produto: produto.codigo || item.codigo || null,
          nome_produto: produto.descricao || produto.nome || item.descricao || 'Sem descrição',
          quantidade: Number(item.quantidade || 0),
          valor_unitario: Number(item.valorUnitario || item.valor_unitario || 0),
          valor_total: Number(item.valorTotal || item.valor_total || 0),
          info_adicional: item.informacoesAdicionais || item.info_adicional || null,
        };
      });

      const { error } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .insert(newItems);

      if (error) {
        console.error(`❌ #${order.numero_pedido} - error:`, error.message);
      } else {
        const withIds = newItems.filter(i => i.id_produto_tiny).length;
        console.log(`✅ #${order.numero_pedido} - fixed ${withIds}/${newItems.length} items with produto IDs`);
        fixed++;
      }

      processed++;

      // Rate limit: 100 req/min = 600ms per request
      if (processed % 10 === 0) {
        console.log(`\n⏳ Processed ${processed}/${orders.length}, pausing...\n`);
        await new Promise(r => setTimeout(r, 1000));
      } else {
        await new Promise(r => setTimeout(r, 650));
      }
    } catch (err: any) {
      console.error(`❌ #${order.numero_pedido} - error:`, err.message);
    }
  }

  console.log('\n✨ Done!');
  console.log(`📊 Processed: ${processed}`);
  console.log(`✅ Fixed: ${fixed}`);
  console.log(`⏭️  Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
