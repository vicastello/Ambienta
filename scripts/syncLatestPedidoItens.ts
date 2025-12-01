import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';

async function main() {
  const arg = Number(process.argv[2] ?? '10');
  const limit = Number.isFinite(arg) && arg > 0 ? Math.min(100, Math.floor(arg)) : 10;

  console.log(`🔍 Buscando os ${limit} pedidos mais recentes...`);
  const { data: pedidos, error } = await supabaseAdmin
    .from('tiny_orders')
    .select('tiny_id, numero_pedido, data_criacao')
    .order('data_criacao', { ascending: false, nullsLast: true })
    .order('inserted_at', { ascending: false, nullsLast: true })
    .limit(limit);

  if (error) {
    console.error('❌ Erro ao buscar pedidos:', error.message);
    process.exit(1);
  }

  const tinyIds = (pedidos ?? [])
    .map((p) => p.tiny_id)
    .filter((id): id is number => typeof id === 'number');

  if (!tinyIds.length) {
    console.log('⚠️  Nenhum pedido recente encontrado.');
    return;
  }

  console.log(`📦 Pedidos selecionados: ${tinyIds.join(', ')}`);

  try {
    const accessToken = await getAccessTokenFromDbOrRefresh();
    console.log('🚀 Sincronizando itens...');
    const result = await sincronizarItensPorPedidos(accessToken, tinyIds, {
      retries: 2,
      delayMs: 900,
    });
    console.log('✅ Resultado:', result);
  } catch (err: any) {
    console.error('❌ Falha ao sincronizar itens:', err?.message ?? err);
    process.exit(1);
  }
}

main();
