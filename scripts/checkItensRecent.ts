import { supabaseAdmin } from '../lib/supabaseAdmin';

async function main() {
  console.log('🔍 Verificando tiny_pedido_itens (últimos 7 dias)...\n');
  try {
    const { data: counts, error: countsError } = await supabaseAdmin
      .rpc('exec_sql', { sql: `
        SELECT id_pedido, COUNT(*) AS itens_count
        FROM tiny_pedido_itens
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY id_pedido
        ORDER BY itens_count DESC
        LIMIT 20;
      ` });

    if (countsError) {
      console.error('Erro ao consultar contagens de itens:', countsError);
    } else {
      console.log('Pedidos com mais itens (últimos 7 dias):');
      console.log(JSON.stringify(counts, null, 2));
    }

    const { data: sample, error: sampleError } = await supabaseAdmin
      .rpc('exec_sql', { sql: `
        SELECT tpi.id_pedido, tpi.id_produto_tiny, tpi.nome_produto, tpi.quantidade, tp.imagem_url
        FROM tiny_pedido_itens tpi
        LEFT JOIN tiny_produtos tp ON tp.id_produto_tiny = tpi.id_produto_tiny
        WHERE tpi.created_at >= NOW() - INTERVAL '7 days'
        ORDER BY tpi.created_at DESC
        LIMIT 20;
      ` });

    if (sampleError) {
      console.error('Erro ao consultar amostra de itens:', sampleError);
    } else {
      console.log('\nAmostra de items recentes com imagens (se houver):');
      console.log(JSON.stringify(sample, null, 2));
    }
  } catch (err: any) {
    console.error('Erro inesperado:', err.message || err);
  }
}

main().catch(console.error);
