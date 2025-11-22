import { supabaseAdmin } from '../lib/supabaseAdmin';

async function main() {
  console.log('🔍 Verificando tiny_orders recentes e itens associados\n');
  try {
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, data_criacao, updated_at')
      .order('updated_at', { ascending: false })
      .limit(20);

    if (ordersError) {
      console.error('Erro ao buscar tiny_orders:', ordersError);
      return;
    }

    for (const o of orders ?? []) {
      const id = (o as any).id;
      const numero = (o as any).numero_pedido;
      const dataCriacao = (o as any).data_criacao;
      const updatedAt = (o as any).updated_at;

      const { data: itens, error: itensError, count } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .select('id, id_produto_tiny, quantidade, tiny_produtos(imagem_url)', { count: 'exact' })
        .eq('id_pedido', id)
        .limit(10);

      console.log(`Order id=${id} numero_pedido=${numero} dataCriacao=${dataCriacao} updated_at=${updatedAt} -> itens_count=${count ?? 0}`);
      if (itensError) console.log('  Erro ao buscar itens:', itensError);
      else if (itens && itens.length > 0) console.log('  Sample item image:', (itens as any)[0].tiny_produtos?.imagem_url ?? 'no image');
      else console.log('  No items found');
    }
  } catch (err: any) {
    console.error('Erro inesperado:', err.message || err);
  }
}

main().catch(console.error);
