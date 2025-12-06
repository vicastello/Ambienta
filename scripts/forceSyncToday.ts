#!/usr/bin/env tsx
/**
 * Force sync orders from today (2025-11-21)
 * This will re-fetch orders from Tiny API and update the database
 * while preserving enriched fields (valor_frete, canal)
 */

// Set env vars before any imports
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://znoiauhdrujwkfryhwiz.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpub2lhdWhkcnVqd2tmcnlod2l6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzM5ODEyNywiZXhwIjoyMDc4OTc0MTI3fQ.J1GFCdU1Fb9Jc5NlQSHkI7vsvXPWbE3l6h-17KLPsZQ';
process.env.TINY_CLIENT_ID = process.env.TINY_CLIENT_ID || 'tiny-api-96c52ae7713211e99e3d9fd50ee4385d928437a7-1763324548';
process.env.TINY_CLIENT_SECRET = process.env.TINY_CLIENT_SECRET || 'vTDeowXckMitwa9brXA2w8CX64m9Axdh';

export {};

async function main() {
  const { listarPedidosTinyPorPeriodo } = await import('../lib/tinyApi');
  const { supabaseAdmin } = await import('../lib/supabaseAdmin');
  const { getAccessTokenFromDbOrRefresh } = await import('../lib/tinyAuth');
  const { mapPedidoToOrderRow } = await import('../lib/tinyMapping');

  console.log('🚀 Forçando atualização dos pedidos de 21/11/2025...\n');

  // Get access token
  const accessToken = await getAccessTokenFromDbOrRefresh();
  
  const dataInicial = '2025-11-21';
  const dataFinal = '2025-11-21';

  let offset = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let hasMore = true;

  while (hasMore) {
    console.log(`📄 Buscando pedidos (offset: ${offset})...`);
    
    const page = await listarPedidosTinyPorPeriodo(accessToken, {
      dataInicial,
      dataFinal,
      limit: 100,
      offset,
      orderBy: 'desc',
    }, 'cron_pedidos');

    const items = page.itens ?? [];
    if (!items.length) {
      hasMore = false;
      break;
    }

    console.log(`   Encontrados ${items.length} pedidos`);

    // Map all items using the proper mapping function
    const rows = items.map((item) => mapPedidoToOrderRow(item as any));

    // Filter valid rows
    const validRows = rows.filter((r) => r.tiny_id && r.data_criacao);

    if (validRows.length > 0) {
      // Buscar pedidos existentes para preservar campos enriquecidos
      const tinyIds = validRows.map(r => r.tiny_id);
      const { data: existing } = await supabaseAdmin
        .from('tiny_orders')
        .select('tiny_id, valor_frete, canal')
        .in('tiny_id', tinyIds);

      const existingMap = new Map(
        (existing || []).map(e => [e.tiny_id, { valor_frete: e.valor_frete, canal: e.canal }])
      );

      // Mesclar: preservar valor_frete e canal enriquecidos
      const mergedRows = validRows.map(row => {
        const exists = existingMap.get(row.tiny_id);
        if (!exists) {
          console.log(`   ✨ Novo pedido: ${row.tiny_id}`);
          return row;
        }

        const preserved = {
          ...row,
          // Preservar valor_frete se já existe e é maior que zero
          valor_frete: (exists.valor_frete && exists.valor_frete > 0) 
            ? exists.valor_frete 
            : row.valor_frete,
          // Preservar canal se já existe e não é "Outros"
          canal: (exists.canal && exists.canal !== 'Outros') 
            ? exists.canal 
            : row.canal,
        };

        const preserved_frete = preserved.valor_frete !== row.valor_frete;
        const preserved_canal = preserved.canal !== row.canal;
        
        if (preserved_frete || preserved_canal) {
          console.log(`   🔒 Preservando pedido ${row.tiny_id}: ${preserved_frete ? 'frete=' + exists.valor_frete : ''} ${preserved_canal ? 'canal=' + exists.canal : ''}`);
        } else {
          console.log(`   🔄 Atualizando pedido ${row.tiny_id}`);
        }

        return preserved;
      });

      const { error: upsertErr } = await supabaseAdmin
        .from('tiny_orders')
        .upsert(mergedRows, { onConflict: 'tiny_id' });

      if (!upsertErr) {
        totalUpdated += mergedRows.length;
        console.log(`   ✅ ${mergedRows.length} pedidos atualizados\n`);
      } else {
        console.error('   ❌ Erro ao atualizar:', upsertErr.message);
      }
    }

    totalProcessed += items.length;
    offset += 100;

    if (items.length < 100) {
      hasMore = false;
    }

    // Respect API rate limit: 100 req/min = 600ms per request
    if (hasMore) {
      console.log('   ⏳ Aguardando 600ms (rate limit)...\n');
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  console.log('\n✨ Sincronização completa!');
  console.log(`📊 Total processado: ${totalProcessed}`);
  console.log(`✅ Total atualizado: ${totalUpdated}`);
  
  // Show summary of today's orders
  const { data: todayOrders, count } = await supabaseAdmin
    .from('tiny_orders')
    .select('tiny_id, valor_frete, canal, situacao', { count: 'exact' })
    .gte('data_criacao', '2025-11-21')
    .lte('data_criacao', '2025-11-21');

  console.log(`\n📈 Resumo dos pedidos de hoje (21/11):`);
  console.log(`   Total: ${count}`);
  
  if (todayOrders) {
    const withFrete = todayOrders.filter(o => o.valor_frete && o.valor_frete > 0).length;
    const withChannel = todayOrders.filter(o => o.canal && o.canal !== 'Outros').length;
    console.log(`   Com frete: ${withFrete}/${count}`);
    console.log(`   Com canal: ${withChannel}/${count}`);
  }
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
