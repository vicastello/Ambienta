import dotenv from 'dotenv';
import path from 'path';

// Carrega envs no mesmo padrão do Next (prioriza .env.local)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function getSupabaseAdmin() {
  const mod = await import('../lib/supabaseAdmin');
  return mod.supabaseAdmin;
}

// Script de backfill: para cada produto em tiny_produtos,
// procura marketplace_sku_mapping (shopee) por tiny_product_id -> marketplace_sku,
// então pega o item mais recente em shopee_order_items (por created_at) onde model_sku/item_sku = marketplace_sku
// e grava os preços encontrados no cadastro do produto (preco/preco_promocional)

async function run() {
  console.log('Iniciando backfill de preços Shopee...');

  const supabaseAdmin = await getSupabaseAdmin();

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
      .select('id, id_produto_tiny, codigo, preco, preco_promocional')
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
      const { data: mapping, error: mappingErr } = await (supabaseAdmin as any)
        .from('marketplace_sku_mapping')
        .select('marketplace_sku')
        .eq('marketplace', 'shopee')
        .eq('tiny_product_id', tinyId)
        .limit(1)
        .maybeSingle();

      const marketplaceSku = mappingErr ? codigo : (mapping?.marketplace_sku ?? codigo);
      if (!marketplaceSku) {
        continue;
      }

      // buscar item mais recente
      const { data: items, error: itemsErr } = await (supabaseAdmin as any)
        .from('shopee_order_items')
        .select('original_price,discounted_price,created_at')
        .or(`model_sku.eq.${marketplaceSku},item_sku.eq.${marketplaceSku}`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (itemsErr) continue;

      if (!items || !items.length) continue;
      const item = items[0];
      const original = item.original_price != null ? Number(item.original_price) : null;
      const discounted = item.discounted_price != null ? Number(item.discounted_price) : null;

      // Atualizar produto: preenche com preços da Shopee sem apagar dados existentes
      const updatePayload: any = {};
      if (original != null && Number.isFinite(original)) updatePayload.preco = original;
      if (discounted != null && Number.isFinite(discounted)) updatePayload.preco_promocional = discounted;

      if (Object.keys(updatePayload).length === 0) continue;

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
