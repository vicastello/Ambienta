import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('tiny_orders')
    .select('numero_pedido, tiny_id, valor, valor_frete, situacao, data_criacao')
    .is('valor_frete', null)
    .gte('data_criacao', today.toISOString())
    .order('numero_pedido', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Erro:', error.message);
    return;
  }

  console.log(`Pedidos de hoje sem valor_frete: ${data?.length ?? 0}`);
  data?.forEach((order) => {
    console.log(`#${order.numero_pedido} | Tiny ${order.tiny_id} | valor ${order.valor} | situacao ${order.situacao}`);
  });
}

main().catch(console.error);
