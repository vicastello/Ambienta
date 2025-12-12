/**
 * Preenche meli_order_items ausentes a partir do raw_payload de meli_orders.
 *
 * Uso:
 *   set -a && source .env.local && set +a && npx tsx scripts/meli-backfill-missing-items.ts 2025-11-01
 */
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function main() {
  const since = process.argv[2] || '2025-11-01';
  console.log(`Buscando orders do Meli desde ${since}...`);

  const orders: any[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('meli_orders')
      .select('meli_order_id, raw_payload')
      .gte('raw_payload->>date_created', since)
      .order('meli_order_id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    orders.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Carregadas ${orders.length} orders. Verificando itens...`);

  // cache de item_id já existentes para evitar violação de unique
  const existingIds = new Set<string>();
  {
    let fromItems = 0;
    const pageSizeItems = 1000;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from('meli_order_items')
        .select('item_id')
        .range(fromItems, fromItems + pageSizeItems - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      data.forEach((row) => {
        if (row.item_id) existingIds.add(String(row.item_id));
      });
      if (data.length < pageSizeItems) break;
      fromItems += pageSizeItems;
    }
  }

  let inserted = 0;

  for (const order of orders) {
    const meliId = order.meli_order_id;
    const rawItems: any[] = order.raw_payload?.order_items || [];
    if (rawItems.length === 0) continue;

    const toInsert: any[] = [];
    for (const it of rawItems) {
      const sku = it.item?.seller_sku || it.item?.id || '';
      const unitPrice = Number(it.unit_price ?? 0);
      const itemId = it.item?.id ? String(it.item.id) : null;
      if (itemId && existingIds.has(itemId)) continue;
      toInsert.push({
        meli_order_id: meliId,
        item_id: itemId,
        title: it.item?.title || sku,
        sku,
        quantity: Number(it.quantity || 0),
        unit_price: unitPrice,
        currency_id: it.currency_id || 'BRL',
        category_id: it.item?.category_id || null,
        variation_id: it.item?.variation_id || null,
        raw_payload: it,
        item_thumbnail_url: it.item?.thumbnail || null,
      });
    }

    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin.from('meli_order_items').insert(toInsert);
      if (error) {
        console.error(`Erro ao inserir itens do pedido ${meliId}:`, error.message);
      } else {
        inserted += toInsert.length;
        toInsert.forEach((i) => i.item_id && existingIds.add(String(i.item_id)));
      }
    }
  }

  console.log(`Itens inseridos: ${inserted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
