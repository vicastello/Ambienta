/**
 * Script para verificar status dos cron jobs do Supabase
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";

async function checkCronStatus() {
  console.log('🔍 Verificando status dos cron jobs do Supabase...\n');

  try {
    // Verificar cron jobs agendados
    const { data: cronJobs, error: cronError } = await supabaseAdmin
      .rpc('pg_stat_statements_reset')
      .then(() => 
        supabaseAdmin.from('cron.job').select('*')
      )
      .catch(async () => {
        // Fallback: tentar query direta
        const { data, error } = await supabaseAdmin
          .rpc('exec_sql', { 
            sql: 'SELECT * FROM cron.job ORDER BY jobid;' 
          })
          .catch(() => ({ data: null, error: null }));
        
        return { data, error };
      });

    if (cronError) {
      console.log('⚠️ Não foi possível acessar cron.job via API');
      console.log('Execute manualmente no SQL Editor:');
      console.log('  SELECT * FROM cron.job;\n');
    } else if (cronJobs) {
      console.log('📋 Cron Jobs Agendados:');
      console.log(JSON.stringify(cronJobs, null, 2));
    }

    // Verificar últimas execuções
    console.log('\n🕐 Últimas execuções (via cron.job_run_details):');
    console.log('Execute no SQL Editor:');
    console.log('  SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;\n');

    // Verificar último pedido sincronizado
    const { data: lastOrder } = await supabaseAdmin
      .from('tiny_orders')
      .select('numero_pedido, data_criacao, updated_at')
      .order('numero_pedido', { ascending: false })
      .limit(1);

    if (lastOrder && lastOrder[0]) {
      console.log('📦 Último pedido no banco:');
      console.log(`   #${lastOrder[0].numero_pedido} | Criado: ${lastOrder[0].data_criacao} | Atualizado: ${lastOrder[0].updated_at}\n`);
    }

    // Verificar últimos produtos sincronizados
    const { data: lastProduct } = await supabaseAdmin
      .from('tiny_produtos')
      .select('id_produto_tiny, nome, saldo, updated_at')
      .order('updated_at', { ascending: false })
      .limit(5);

    if (lastProduct && lastProduct.length > 0) {
      console.log('🏷️ Últimos produtos atualizados:');
      lastProduct.forEach(p => {
        console.log(`   ID ${p.id_produto_tiny}: ${p.nome} | Saldo: ${p.saldo} | ${p.updated_at}`);
      });
      console.log();
    }

    // Verificar contadores
    const { count: totalOrders } = await supabaseAdmin
      .from('tiny_orders')
      .select('*', { count: 'exact', head: true });

    const { count: totalProducts } = await supabaseAdmin
      .from('tiny_produtos')
      .select('*', { count: 'exact', head: true });

    const { count: productsWithStock } = await supabaseAdmin
      .from('tiny_produtos')
      .select('*', { count: 'exact', head: true })
      .not('saldo', 'is', null);

    console.log('📊 Estatísticas:');
    console.log(`   Total de pedidos: ${totalOrders}`);
    console.log(`   Total de produtos: ${totalProducts}`);
    console.log(`   Produtos com estoque: ${productsWithStock}`);
    console.log(`   Produtos sem estoque: ${totalProducts! - productsWithStock!}`);

  } catch (error: any) {
    console.error('❌ Erro:', error.message);
  }
}

checkCronStatus().catch(console.error);
