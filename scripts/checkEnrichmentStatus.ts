import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  console.log('🔍 Verificando pedidos sem frete...\n');
  
  const { count: semFrete } = await supabase
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .or('valor_frete.is.null,valor_frete.eq.0');
  
  const { count: comFrete } = await supabase
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .gt('valor_frete', 0);
  
  const { count: semCanal } = await supabase
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .or('canal.is.null,canal.eq.,canal.eq.Outros');
  
  const { count: total } = await supabase
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true });
  
  console.log('📊 Status de Enriquecimento:');
  console.log('Total de pedidos:', total);
  console.log('Com frete:', comFrete, `(${((comFrete! / total!) * 100).toFixed(1)}%)`);
  console.log('Sem frete:', semFrete, `(${((semFrete! / total!) * 100).toFixed(1)}%)`);
  console.log('Sem canal (null/vazio/Outros):', semCanal, `(${((semCanal! / total!) * 100).toFixed(1)}%)`);
  
  console.log('\n🔍 Últimos 10 pedidos criados:');
  const { data: recent } = await supabase
    .from('tiny_orders')
    .select('tiny_id, data_criacao, valor, valor_frete, canal, updated_at')
    .order('data_criacao', { ascending: false })
    .limit(10);
  
  recent?.forEach(p => {
    console.log(`- Pedido ${p.tiny_id}: valor=R$${p.valor}, frete=${p.valor_frete ? 'R$'+p.valor_frete : 'NULL'}, canal=${p.canal || 'NULL'}`);
  });
  
  console.log('\n🔍 Amostra de pedidos SEM frete:');
  const { data: noFrete } = await supabase
    .from('tiny_orders')
    .select('tiny_id, data_criacao, valor, valor_frete, canal')
    .or('valor_frete.is.null,valor_frete.eq.0')
    .order('data_criacao', { ascending: false })
    .limit(5);
  
  noFrete?.forEach(p => {
    console.log(`- Pedido ${p.tiny_id}: R$${p.valor}, canal=${p.canal || 'NULL'}`);
  });
})();
