import { supabaseAdmin } from '../lib/supabaseAdmin';

async function main() {
  console.log('🔍 Verificando tiny_pedido_itens (últimos 7 dias) via Postgrest...\n');
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: items, error: itemsError } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido, id_produto_tiny, nome_produto, quantidade, created_at, tiny_produtos(imagem_url)')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);

    if (itemsError) {
      console.error('Erro ao buscar itens recentes via Postgrest:', itemsError);
    } else {
      console.log(`Encontrados ${items?.length ?? 0} itens recentes (até 50):`);
      console.log(JSON.stringify(items, null, 2));
    }

    const { data: pedidoCounts, error: countsError } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido', { count: 'exact' })
      .gte('created_at', since);

    if (countsError) {
      console.error('Erro ao contar pedidos com itens recentes:', countsError);
    } else {
      console.log('\nContagem de itens registrada (consulta de exemplo):');
      console.log(`Total rows returned: ${pedidoCounts?.length ?? 0}`);
    }

  } catch (err: any) {
    console.error('Erro inesperado:', err.message || err);
  }
}

main().catch(console.error);
