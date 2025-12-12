import { supabaseAdmin } from '../lib/supabaseAdmin';

async function main() {
  const startDate = '2025-11-01';
  console.log('Preenchendo codigo_produto para itens do Tiny a partir do catálogo...');

  // Buscar pedidos desde a data de corte
  const { data: pedidos, error: pedidosErr } = await supabaseAdmin
    .from('tiny_orders')
    .select('id')
    .gte('data_criacao', startDate);

  if (pedidosErr) {
    console.error('Erro ao buscar pedidos:', pedidosErr);
    process.exit(1);
  }

  const pedidoIds = (pedidos ?? []).map((p: any) => p.id);
  if (!pedidoIds.length) {
    console.log('Nenhum pedido no intervalo.');
    return;
  }

  // Buscar itens com codigo_produto vazio, id_produto_tiny presente e pedidos no intervalo
  const { data: itens, error } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id, id_pedido, id_produto_tiny, codigo_produto')
    .is('codigo_produto', null)
    .not('id_produto_tiny', 'is', null)
    .not('id_pedido', 'is', null)
    .in('id_pedido', pedidoIds);

  if (error) {
    console.error('Erro ao buscar itens:', error);
    process.exit(1);
  }

  const registros = itens || [];
  if (!registros.length) {
    console.log('Nenhum item para atualizar.');
    return;
  }

  const idsProdutos = Array.from(new Set(registros.map((i: any) => i.id_produto_tiny)));
  const { data: produtos, error: prodErr } = await supabaseAdmin
    .from('tiny_produtos')
    .select('id_produto_tiny, codigo')
    .in('id_produto_tiny', idsProdutos);

  if (prodErr) {
    console.error('Erro ao buscar produtos:', prodErr);
    process.exit(1);
  }

  const mapCodigos = new Map<number, string>();
  (produtos ?? []).forEach((p: any) => {
    if (p.codigo) mapCodigos.set(p.id_produto_tiny, p.codigo);
  });

  const updates = registros
    .map((item: any) => {
      const codigo = item.id_produto_tiny ? mapCodigos.get(item.id_produto_tiny) : null;
      if (!codigo) return null;
      return { id: item.id, codigo_produto: codigo };
    })
    .filter(Boolean) as Array<{ id: number; codigo_produto: string }>;

  console.log(`Encontrados ${registros.length} itens sem código; ${updates.length} têm código disponível.`);

  const chunkSize = 500;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    for (const item of chunk) {
      const { error: upErr } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .update({ codigo_produto: item.codigo_produto })
        .eq('id', item.id);
      if (upErr) {
        console.error('Erro ao atualizar item', item.id, upErr);
        process.exit(1);
      }
    }
    console.log(`Atualizados ${Math.min(i + chunkSize, updates.length)} / ${updates.length}`);
  }

  console.log('Backfill concluído.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
