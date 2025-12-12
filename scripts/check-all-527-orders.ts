import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/db-public';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function checkAll() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== VERIFICANDO TODOS OS PEDIDOS SEM ITENS ===\n');

  // Buscar TODOS os pedidos sem itens usando paginação
  const allPedidosSemItens: any[] = [];
  let currentPage = 0;
  const pageSize = 1000;

  console.log('Buscando pedidos sem itens...');

  while (true) {
    const { data: pedidosPage } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, data_criacao, canal, situacao, raw_payload')
      .gte('data_criacao', startDate)
      .lte('data_criacao', endDate)
      .order('data_criacao', { ascending: false })
      .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

    if (!pedidosPage || pedidosPage.length === 0) break;

    // Filtrar apenas pedidos sem itens
    for (const pedido of pedidosPage) {
      const { data: itens } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .select('id')
        .eq('id_pedido', pedido.id)
        .limit(1);

      if (!itens || itens.length === 0) {
        allPedidosSemItens.push(pedido);
      }
    }

    if (pedidosPage.length < pageSize) break;
    currentPage++;

    console.log(`  Página ${currentPage}: ${allPedidosSemItens.length} pedidos sem itens até agora...`);
  }

  console.log(`\n✓ Total de pedidos sem itens: ${allPedidosSemItens.length}\n`);

  // Analisar quais têm itens no raw_payload
  let comItensNoPayload = 0;
  let semItensNoPayload = 0;
  let payloadNulo = 0;
  const exemplosComItens: any[] = [];

  console.log('Analisando raw_payload de cada pedido...');

  for (const pedido of allPedidosSemItens) {
    if (!pedido.raw_payload) {
      payloadNulo++;
      continue;
    }

    const itensPayload = pedido.raw_payload?.pedido?.itens;

    if (itensPayload) {
      const itens = Array.isArray(itensPayload) ? itensPayload : [itensPayload];

      if (itens.length > 0 && itens[0]?.item) {
        comItensNoPayload++;
        if (exemplosComItens.length < 5) {
          exemplosComItens.push({
            id: pedido.id,
            numero: pedido.numero_pedido,
            canal: pedido.canal,
            situacao: pedido.situacao,
            qtd_itens: itens.length,
            primeiro_item: itens[0].item?.descricao || 'N/A',
          });
        }
      } else {
        semItensNoPayload++;
      }
    } else {
      semItensNoPayload++;
    }
  }

  console.log('\n=== RESULTADO FINAL ===');
  console.log(`Total de pedidos sem itens: ${allPedidosSemItens.length}`);
  console.log(`Payload nulo: ${payloadNulo}`);
  console.log(`Sem itens no raw_payload (OK - cancelados/em processamento): ${semItensNoPayload}`);
  console.log(`COM itens no raw_payload (PRECISAM BACKFILL): ${comItensNoPayload}`);

  if (comItensNoPayload > 0) {
    console.log(`\n⚠️  ${comItensNoPayload} pedidos têm itens no Tiny mas não foram importados!`);
    console.log('\nExemplos de pedidos que precisam backfill:');
    exemplosComItens.forEach(p => {
      console.log(`  #${p.numero} (ID: ${p.id}) - ${p.canal} - ${p.qtd_itens} itens - "${p.primeiro_item}"`);
    });
  } else {
    console.log('\n✓ Todos os pedidos sem itens são cancelados ou em processamento (OK)');
  }
}

checkAll().catch(console.error);
