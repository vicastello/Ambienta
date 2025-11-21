import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProgress() {
  console.log('📊 Verificando progresso da sincronização...\n');

  try {
    // Total de pedidos
    const { count: totalPedidos, error: e1 } = await supabase
      .from('tiny_orders')
      .select('*', { count: 'exact', head: true });

    if (e1) throw e1;

    // Total de itens
    const { count: totalItens, error: e2 } = await supabase
      .from('tiny_pedido_itens')
      .select('*', { count: 'exact', head: true });

    if (e2) throw e2;

    // Pedidos únicos com itens (sample)
    const { data: sampleData, error: e3 } = await supabase
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .limit(1000);

    if (e3) throw e3;

    const pedidosUnicos = new Set(sampleData?.map(p => p.id_pedido) || []).size;

    console.log(`Total de pedidos: ${totalPedidos || 0}`);
    console.log(`Total de itens salvos: ${totalItens || 0}`);
    console.log(`Pedidos únicos (amostra de 1000 itens): ${pedidosUnicos}`);
    
    if (totalPedidos && totalItens && pedidosUnicos) {
      console.log(`Média de itens por pedido: ${(totalItens / pedidosUnicos).toFixed(2)}`);
    }
  } catch (error) {
    console.error('❌ Erro ao verificar progresso:', error);
  }
}

checkProgress();
