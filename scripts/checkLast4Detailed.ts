import { supabaseAdmin } from '../lib/supabaseAdmin';

async function main() {
  console.log('🔎 Checando 4 pedidos mais recentes e seus itens/imagens\n');

  try {
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, data_criacao, updated_at, raw')
      .order('updated_at', { ascending: false })
      .limit(4);

    if (ordersError) {
      console.error('Erro ao buscar tiny_orders:', ordersError);
      process.exit(1);
    }

    if (!orders || orders.length === 0) {
      console.log('Nenhum pedido encontrado.');
      return;
    }

    for (const o of orders) {
      const id = (o as any).id;
      const numero = (o as any).numero_pedido;
      const dataCriacao = (o as any).data_criacao;
      const updatedAt = (o as any).updated_at;

      console.log(`Pedido id=${id} numero_pedido=${numero} data_criacao=${dataCriacao} updated_at=${updatedAt}`);

      const { data: itens, error: itensError } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .select('id, id_produto_tiny, quantidade, nome_produto, tiny_produtos(imagem_url)')
        .eq('id_pedido', id);

      if (itensError) {
        console.error('  Erro ao buscar itens:', itensError);
        continue;
      }

      const itensArr = itens ?? [];
      console.log(`  itens_count=${itensArr.length}`);

      const itemsWithImage = itensArr.filter((it: any) => !!it.tiny_produtos?.imagem_url);
      console.log(`  items_with_imagem_url=${itemsWithImage.length}`);

      if (itemsWithImage.length > 0) {
        console.log('  amostras_imagem_urls:');
        for (let i = 0; i < Math.min(3, itemsWithImage.length); i++) {
          console.log('   -', itemsWithImage[i].tiny_produtos.imagem_url);
        }
      }

      if (itensArr.length === 0) {
        // tentar extrair imagem do raw
        const raw = (o as any).raw ?? {};
        const itensRaw = Array.isArray(raw?.pedido?.itens) ? raw.pedido.itens : (Array.isArray(raw?.itens) ? raw.itens : []);
        const firstRaw = itensRaw[0]?.produto ?? {};
        const imagemFromRaw = firstRaw?.imagemPrincipal?.url || firstRaw?.imagemPrincipal || firstRaw?.imagem || firstRaw?.foto || null;
        console.log('  nenhum item persistido. imagem no payload raw:', imagemFromRaw ? imagemFromRaw : 'N/A');
      }

      // List distinct produto ids referenced and whether produto record has imagem_url
      const produtoIds = Array.from(new Set(itensArr.map((it: any) => it.id_produto_tiny).filter(Boolean)));
      if (produtoIds.length > 0) {
        const { data: produtos, error: produtosError } = await supabaseAdmin
          .from('tiny_produtos')
          .select('id_produto_tiny, imagem_url')
          .in('id_produto_tiny', produtoIds);

        if (produtosError) console.log('  Erro ao buscar tiny_produtos:', produtosError);
        else {
          for (const p of produtos ?? []) {
            console.log(`   produto id_produto_tiny=${(p as any).id_produto_tiny} imagem_url=${(p as any).imagem_url ?? 'N/A'}`);
          }
        }
      }

      console.log('');
    }
  } catch (err: any) {
    console.error('Erro inesperado:', err.message || err);
  }
}

main().catch(console.error);
