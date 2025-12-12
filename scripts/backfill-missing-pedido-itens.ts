import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/db-public';
import { salvarItensPedido } from '../lib/pedidoItensHelper';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const accessToken = process.env.TINY_API_TOKEN!;

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function backfillMissingItems() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== BACKFILL: PEDIDOS SEM ITENS ===\n');
  console.log(`Período: ${startDate} até ${endDate}\n`);

  // 1. Buscar todos os pedidos do período
  console.log('1. Buscando pedidos...');
  const allPedidos: any[] = [];
  let currentPage = 0;
  const pageSize = 1000;

  while (true) {
    const { data: pedidosPage } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, canal, situacao')
      .gte('data_criacao', startDate)
      .lte('data_criacao', endDate)
      .order('data_criacao', { ascending: false })
      .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

    if (!pedidosPage || pedidosPage.length === 0) break;
    allPedidos.push(...pedidosPage);
    if (pedidosPage.length < pageSize) break;
    currentPage++;
  }

  console.log(`   ✓ ${allPedidos.length} pedidos carregados\n`);

  // 2. Buscar todos os itens
  console.log('2. Identificando pedidos sem itens...');
  const pedidoIds = allPedidos.map(p => p.id);
  const allItens: any[] = [];
  const chunkSize = 1000;

  for (let i = 0; i < pedidoIds.length; i += chunkSize) {
    const chunk = pedidoIds.slice(i, i + chunkSize);
    const { data: itensChunk } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id, id_pedido')
      .in('id_pedido', chunk);

    if (itensChunk) {
      allItens.push(...itensChunk);
    }
  }

  const pedidosComItens = new Set<number>();
  allItens.forEach(item => {
    pedidosComItens.add(item.id_pedido);
  });

  const pedidosSemItens = allPedidos.filter(p => !pedidosComItens.has(p.id));

  console.log(`   ✓ ${pedidosSemItens.length} pedidos sem itens\n`);

  if (pedidosSemItens.length === 0) {
    console.log('✓ Nenhum pedido precisa de backfill!');
    return;
  }

  // 3. Processar backfill
  console.log('3. Iniciando backfill...\n');

  let sucesso = 0;
  let falha = 0;
  let semItensNaTiny = 0;

  for (let i = 0; i < pedidosSemItens.length; i++) {
    const pedido = pedidosSemItens[i];

    console.log(`[${i + 1}/${pedidosSemItens.length}] Pedido #${pedido.numero_pedido} (ID: ${pedido.id}, Tiny ID: ${pedido.tiny_id})`);

    try {
      const qtdItens = await salvarItensPedido(
        accessToken,
        pedido.tiny_id,
        pedido.id,
        { context: 'backfill-missing-items' }
      );

      if (qtdItens === null) {
        console.log(`   ✗ Falha ao buscar itens`);
        falha++;
      } else if (qtdItens === 0) {
        console.log(`   ○ Sem itens no Tiny (pedido vazio/cancelado)`);
        semItensNaTiny++;
      } else {
        console.log(`   ✓ ${qtdItens} itens salvos`);
        sucesso++;
      }
    } catch (error: any) {
      console.log(`   ✗ Erro: ${error.message || error}`);
      falha++;
    }

    // Delay entre requisições para respeitar rate limit da API Tiny
    if (i < pedidosSemItens.length - 1) {
      await delay(600); // 600ms entre pedidos
    }
  }

  console.log('\n=== RESULTADO ===');
  console.log(`Total processado: ${pedidosSemItens.length}`);
  console.log(`Sucesso: ${sucesso} pedidos`);
  console.log(`Sem itens no Tiny: ${semItensNaTiny} pedidos`);
  console.log(`Falhas: ${falha} pedidos`);

  if (sucesso > 0) {
    console.log(`\n✓ Backfill concluído! ${sucesso} pedidos agora têm itens.`);
  }
}

backfillMissingItems().catch(console.error);
