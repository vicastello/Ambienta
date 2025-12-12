import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkReal() {
  // Contar total de itens
  const { count: totalItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('*', { count: 'exact', head: true });

  console.log('Total de itens na tabela:', totalItems);

  // Contar pedidos únicos com itens
  const { data: items } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido');

  const uniquePedidos = new Set(items?.map(i => i.id_pedido) || []);
  console.log('Pedidos únicos com itens:', uniquePedidos.size);

  // Total de pedidos desde 01/11
  const { count: totalOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .gte('data_criacao', '2025-11-01');

  console.log('Total de pedidos desde 01/11:', totalOrders);
  console.log('Faltam:', (totalOrders || 0) - uniquePedidos.size);
}

checkReal().catch(console.error);
