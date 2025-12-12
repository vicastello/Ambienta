/**
 * Garante que todos os pedidos filhos de um pack_id do Mercado Livre
 * estejam vinculados ao mesmo pedido Tiny.
 *
 * Uso:
 *   set -a && source .env.local && set +a && npx tsx scripts/meli-link-pack-orders.ts
 */
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function main() {
  console.log('Buscando vínculos Mercado Livre com pack_id...');

  const links: any[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('marketplace_order_id, tiny_order_id')
      .eq('marketplace', 'mercado_livre')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    links.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Mapa para consultar pack_id
  const orderIds = links.map((l) => l.marketplace_order_id);
  const packMap = new Map<string, string>(); // meli_order_id -> pack_id
  for (let i = 0; i < orderIds.length; i += 1000) {
    const chunk = orderIds.slice(i, i + 1000).map((id) => Number(id));
    const { data } = await supabaseAdmin
      .from('meli_orders')
      .select('meli_order_id, raw_payload->>pack_id')
      .in('meli_order_id', chunk);
    (data || []).forEach((row) => {
      if (row['raw_payload->>pack_id']) {
        packMap.set(String(row.meli_order_id), String(row['raw_payload->>pack_id']));
      }
    });
  }

  let inserted = 0;
  for (const link of links) {
    const packId = packMap.get(String(link.marketplace_order_id));
    if (!packId) continue;

    // busca todos os pedidos do pack
    const { data: siblings } = await supabaseAdmin
      .from('meli_orders')
      .select('meli_order_id')
      .eq('raw_payload->>pack_id', packId);

    const siblingIds = (siblings || []).map((s) => String(s.meli_order_id));
    if (siblingIds.length === 0) continue;

    const { data: existingLinks } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('marketplace_order_id')
      .eq('tiny_order_id', link.tiny_order_id)
      .eq('marketplace', 'mercado_livre');

    const existingSet = new Set((existingLinks || []).map((l) => String(l.marketplace_order_id)));

    const toInsert = siblingIds
      .filter((id) => !existingSet.has(id))
      .map((id) => ({
        marketplace: 'mercado_livre',
        marketplace_order_id: id,
        tiny_order_id: link.tiny_order_id,
        linked_by: 'meli-link-pack-orders',
        notes: `Pack ${packId}`,
        confidence_score: 1,
      }));

    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin.from('marketplace_order_links').insert(toInsert);
      if (error) {
        console.error(`Erro ao vincular pack ${packId}:`, error.message);
      } else {
        inserted += toInsert.length;
      }
    }
  }

  console.log(`Links inseridos: ${inserted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
