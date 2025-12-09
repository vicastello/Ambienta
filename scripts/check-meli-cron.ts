/**
 * Script para verificar o status do cron job do Mercado Livre
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";

async function checkMeliCron() {
  console.log("🔍 Verificando status do cron do Mercado Livre...\n");

  try {
    console.log("✅ Verificando cron do Mercado Livre...\n");

    // Verificar últimos logs de sync
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('sync_logs')
      .select('*')
      .or('message.ilike.%meli%,meta->>url.ilike.%mercado-livre%')
      .order('created_at', { ascending: false })
      .limit(5);

    if (logsError) {
      console.error("❌ Erro ao buscar logs:", logsError.message);
    } else if (logs && logs.length > 0) {
      console.log("📋 Últimos logs de sync do Mercado Livre:");
      logs.forEach((log) => {
        const date = new Date(log.created_at).toLocaleString('pt-BR');
        console.log(`   [${log.level.toUpperCase()}] ${date}`);
        console.log(`   ${log.message}`);
        if (log.meta) {
          console.log(`   Meta:`, JSON.stringify(log.meta, null, 2));
        }
        console.log();
      });
    } else {
      console.log("⚠️  Nenhum log de sync do Mercado Livre encontrado");
      console.log("   O cron pode não ter executado ainda ou houve erro.\n");
    }

    // Verificar pedidos do Mercado Livre
    const { count, error: countError } = await supabaseAdmin
      .from('meli_orders')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error("❌ Erro ao contar pedidos:", countError.message);
    } else {
      console.log(`📦 Total de pedidos do Mercado Livre no banco: ${count}\n`);
    }

  } catch (error: any) {
    console.error("❌ Erro:", error.message);
  }
}

checkMeliCron().catch(console.error);
