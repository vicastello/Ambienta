#!/usr/bin/env tsx
/**
 * Mostra os itens de um pedido Tiny agrupados e brutos,
 * para investigar duplicações na UI.
 * Uso: npx tsx scripts/debug-order-items.ts <numero_pedido>
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function run() {
  const numeroPedido = process.argv[2];
  if (!numeroPedido) {
    console.error('Uso: npx tsx scripts/debug-order-items.ts <numero_pedido>');
    process.exit(1);
  }
  // Busca pedido
  const { data: pedido } = await supabase
    .from('tiny_orders')
    .select('id, numero_pedido, canal, cliente_nome, valor, data_criacao')
    .eq('numero_pedido', numeroPedido)
    .single();
  if (!pedido) {
    console.error('Pedido não encontrado');
    process.exit(1);
  }
  console.log('Pedido:', pedido);

  // Itens brutos
  const { data: itens } = await supabase
    .from('tiny_pedido_itens')
    .select('id, codigo_produto, nome_produto, quantidade, valor_unitario, valor_total')
    .eq('id_pedido', pedido.id)
    .order('id');
  console.log('\nItens brutos:', itens?.length);
  itens?.forEach((i) => console.log(i));

  // Agrupado por SKU + valor_unitario
  const grouped = new Map<string, { sku: string; vu: number; qtd: number; vt: number }>();
  itens?.forEach((i) => {
    const key = `${i.codigo_produto}||${i.valor_unitario}`;
    const g = grouped.get(key) || { sku: i.codigo_produto || '', vu: i.valor_unitario, qtd: 0, vt: 0 };
    g.qtd += i.quantidade;
    g.vt += i.valor_total;
    grouped.set(key, g);
  });
  console.log('\nAgrupado (SKU + valor_unitario):');
  grouped.forEach((g) => console.log(g));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
