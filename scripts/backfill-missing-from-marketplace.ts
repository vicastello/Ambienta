#!/usr/bin/env tsx
/**
 * Backfill de itens faltantes em tiny_pedido_itens usando itens do marketplace.
 * Uso: NODE_OPTIONS='-r dotenv/config' DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-missing-from-marketplace.ts 2025-11-12 2025-12-12
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type OrderLink = {
  marketplace: string;
  marketplace_order_id: string;
  tiny_order_id: number;
};

async function main() {
  const start = process.argv[2] || '2025-11-12';
  const end = process.argv[3] || '2025-12-12';

  console.log(`Backfill itens faltantes via marketplace (${start} até ${end})`);

  // Buscar pedidos do intervalo
  const allOrders: { id: number }[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('tiny_orders')
      .select('id')
      .gte('data_criacao', start)
      .lte('data_criacao', end)
      .order('data_criacao', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allOrders.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`Pedidos carregados: ${allOrders.length}`);

  // Mapear quais têm itens
  const hasItem = new Set<number>();
  for (let i = 0; i < allOrders.length; i += 1000) {
    const chunk = allOrders.slice(i, i + 1000).map((o) => o.id);
    let f = 0;
    while (true) {
      const { data, error } = await supabase
        .from('tiny_pedido_itens')
        .select('id_pedido')
        .in('id_pedido', chunk)
        .range(f, f + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      data.forEach((r) => hasItem.add(r.id_pedido));
      if (data.length < 1000) break;
      f += 1000;
    }
  }

  const missingOrders = allOrders.filter((o) => !hasItem.has(o.id));
  console.log(`Pedidos sem itens no Tiny: ${missingOrders.length}`);

  if (missingOrders.length === 0) return;

  // Buscar links marketplace
  const links: OrderLink[] = [];
  for (let i = 0; i < missingOrders.length; i += 1000) {
    const chunk = missingOrders.slice(i, i + 1000).map((o) => o.id);
    const { data, error } = await supabase
      .from('marketplace_order_links')
      .select('marketplace, marketplace_order_id, tiny_order_id')
      .in('tiny_order_id', chunk);
    if (error) throw error;
    if (data) links.push(...data);
  }
  console.log(`Links encontrados: ${links.length}`);

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const l of links) {
    try {
      let items: { sku: string; name: string; qty: number; price: number | null }[] = [];
      if (l.marketplace === 'shopee') {
        const { data } = await supabase
          .from('shopee_order_items')
          .select('model_sku, item_sku, item_name, quantity, discounted_price, original_price')
          .eq('order_sn', l.marketplace_order_id);
        if (data) {
          items = data.map((r) => ({
            sku: r.model_sku || r.item_sku || '',
            name: r.item_name || r.model_sku || r.item_sku || '',
            qty: Number(r.quantity || 0),
            price: r.discounted_price ?? r.original_price ?? null,
          }));
        }
      } else if (l.marketplace === 'magalu') {
        const { data } = await supabase
          .from('magalu_order_items')
          .select('id_sku, product_name, quantity, price, discount')
          .eq('id_order', l.marketplace_order_id);
        if (data) {
          items = data.map((r) => ({
            sku: String(r.id_sku ?? ''),
            name: String((r as any).product_name ?? r.id_sku ?? ''),
            qty: Number(r.quantity || 0),
            price: typeof r.price === 'number' ? r.price : Number(r.price) || null,
          }));
        }
      } else if (l.marketplace === 'mercado_livre') {
        const { data } = await supabase
          .from('meli_order_items')
          .select('sku, title, quantity, unit_price')
          .eq('meli_order_id', Number(l.marketplace_order_id));
        if (data) {
          items = data.map((r) => ({
            sku: r.sku || '',
            name: r.title || r.sku || '',
            qty: Number(r.quantity || 0),
            price: typeof r.unit_price === 'number' ? r.unit_price : Number(r.unit_price) || null,
          }));
        }
      }

      if (!items.length) {
        skipped++;
        continue;
      }

      const rows = items.map((it) => {
        const valor_total = (it.price ?? 0) * it.qty;
        return {
          id_pedido: l.tiny_order_id,
          id_produto_tiny: null,
          codigo_produto: it.sku || 'SEM-CODIGO',
          nome_produto: it.name || it.sku || 'Sem nome',
          quantidade: it.qty,
          valor_unitario: it.price ?? 0,
          valor_total,
          info_adicional: 'backfill from marketplace',
        };
      });

      const { error: upsertErr } = await supabase
        .from('tiny_pedido_itens')
        .upsert(rows, { onConflict: ['id_pedido', 'codigo_produto', 'valor_unitario', 'valor_total'] });
      if (upsertErr) throw upsertErr;
      inserted += rows.length;
    } catch (err) {
      failed++;
      console.error('Erro no pedido', l.tiny_order_id, err);
    }
  }

  console.log(`Inseridos: ${inserted}, pulados: ${skipped}, falhas: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
