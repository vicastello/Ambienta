import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabaseAdmin';

// Script de backfill: para cada produto em tiny_products (tiny_orders source),
// procura marketplace_sku_mapping (shopee) por tiny_product_id -> marketplace_sku,
// então pega o item mais recente em shopee_order_items (por created_at) onde model_sku/item_sku = marketplace_sku
// e grava os preços encontrados em tiny_products (campos novos: preco_shopee_original, preco_shopee_promocional)

async function run() {
  console.log('Iniciando backfill de preços Shopee...');

  // Ajuste: tabela de produtos no projeto é 'tiny_produtos' ou 'tiny_products'? vamos checar por ambas
  const produtoTables = ['tiny_produtos', 'produtos', 'tiny_products'];
  let produtosTable: string | null = null;
  for (const t of produtoTables) {
    const { data, error } = await (supabaseAdmin as any).from(t).select('id_produto_tiny').limit(1);
    if (!error) { produtosTable = t; break; }
  }

  if (!produtosTable) {
    console.error('Não encontrei tabela de produtos conhecida (tiny_produtos / produtos / tiny_products). Abortando.');
    process.exit(1);
  }

  console.log('Usando tabela de produtos:', produtosTable);

  // Página por página para evitar memória
  const pageSize = 500;
  let offset = 0;
  let totalUpdated = 0;

  while (true) {
    console.log(`Lendo produtos: offset=${offset}`);
    const { data: produtos, error: prodErr } = await (supabaseAdmin as any)
      .from(produtosTable)
      .select('id, id_produto_tiny, codigo')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (prodErr) {
      console.error('Erro ao ler produtos:', prodErr);
      break;
    }
    if (!produtos || produtos.length === 0) break;

    for (const p of produtos) {
      const tinyId = p.id_produto_tiny;
      const codigo = p.codigo ?? null;

      // procurar mapping
      const { data: mapping } = await (supabaseAdmin as any)
        .from('marketplace_sku_mapping')
        .select('marketplace_sku')
        .eq('marketplace', 'shopee')
        .eq('tiny_product_id', tinyId)
        .limit(1)
        .single()
        .catch(() => ({ data: null }));

      const marketplaceSku = mapping?.marketplace_sku ?? codigo;
      if (!marketplaceSku) {
        continue;
      }

      // buscar item mais recente
      const { data: items } = await (supabaseAdmin as any)
        .from('shopee_order_items')
        .select('original_price,discounted_price,created_at')
        .or(`model_sku.eq.${marketplaceSku},item_sku.eq.${marketplaceSku}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .catch(() => ({ data: null }));

      if (!items || !items.length) continue;
      const item = items[0];
      const original = item.original_price != null ? Number(item.original_price) : null;
      const discounted = item.discounted_price != null ? Number(item.discounted_price) : null;

      // Atualizar produto — não sobrescrever campos Tiny originais, usar campos de integração
      const updatePayload: any = {
        preco_shopee_original: original,
        preco_shopee_promocional: discounted,
        shopee_price_synced_at: new Date().toISOString(),
      };

      const { error: upErr } = await (supabaseAdmin as any)
        .from(produtosTable)
        .update(updatePayload)
        .eq('id', p.id);

      if (upErr) {
        console.error('Erro atualizando produto id=', p.id, upErr);
        continue;
      }
      totalUpdated++;
    }

    offset += pageSize;
  }

  console.log('Backfill completo. totalUpdated=', totalUpdated);
  process.exit(0);
}

run().catch((err) => {
  console.error('Erro fatal no backfill:', err);
  process.exit(1);
});
