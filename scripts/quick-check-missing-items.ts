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

async function quickCheck() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== VERIFICAÇÃO RÁPIDA: PEDIDOS COM ITENS NO PAYLOAD MAS SEM NA TABELA ===\n');

  // Buscar pedidos com paginação
  const allPedidos: any[] = [];
  let currentPage = 0;
  const pageSize = 1000;

  console.log('1. Buscando todos os pedidos...');
  while (true) {
    const { data: pedidosPage } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, numero_pedido, canal, raw_payload')
      .gte('data_criacao', startDate)
      .lte('data_criacao', endDate)
      .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

    if (!pedidosPage || pedidosPage.length === 0) break;
    allPedidos.push(...pedidosPage);
    if (pedidosPage.length < pageSize) break;
    currentPage++;
  }

  console.log(`   ✓ ${allPedidos.length} pedidos carregados\n`);

  // Buscar todos os itens
  console.log('2. Buscando todos os itens...');
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

  console.log(`   ✓ ${allItens.length} itens carregados\n`);

  // Criar set de pedidos com itens
  const pedidosComItens = new Set<number>();
  allItens.forEach(item => {
    pedidosComItens.add(item.id_pedido);
  });

  // Verificar pedidos sem itens que têm itens no payload
  console.log('3. Analisando pedidos sem itens...');
  let comItensNoPayload = 0;
  let semItensNoPayload = 0;
  const exemplos: any[] = [];

  for (const pedido of allPedidos) {
    if (pedidosComItens.has(pedido.id)) continue; // Tem itens, OK

    // Não tem itens na tabela, verificar payload
    const itensPayload = pedido.raw_payload?.pedido?.itens;

    if (itensPayload) {
      const itens = Array.isArray(itensPayload) ? itensPayload : [itensPayload];

      // Verificar se tem pelo menos um item válido
      const itemsValidos = itens.filter((i: any) => i?.item?.descricao || i?.item?.codigo);

      if (itemsValidos.length > 0) {
        comItensNoPayload++;
        if (exemplos.length < 10) {
          exemplos.push({
            id: pedido.id,
            numero: pedido.numero_pedido,
            canal: pedido.canal,
            qtd: itemsValidos.length,
            primeiro: itemsValidos[0]?.item?.descricao || itemsValidos[0]?.item?.codigo || 'N/A',
          });
        }
      } else {
        semItensNoPayload++;
      }
    } else {
      semItensNoPayload++;
    }
  }

  console.log('\n=== RESULTADO ===');
  console.log(`Total de pedidos: ${allPedidos.length}`);
  console.log(`Pedidos com itens na tabela: ${pedidosComItens.size}`);
  console.log(`Pedidos sem itens na tabela: ${allPedidos.length - pedidosComItens.size}`);
  console.log(`  - Sem itens no payload (OK): ${semItensNoPayload}`);
  console.log(`  - COM itens no payload (PROBLEMA): ${comItensNoPayload}`);

  if (comItensNoPayload > 0) {
    console.log(`\n⚠️  ${comItensNoPayload} PEDIDOS PRECISAM DE BACKFILL!`);
    console.log('\nExemplos:');
    exemplos.forEach(p => {
      console.log(`  #${p.numero} (ID: ${p.id}) - ${p.canal} - ${p.qtd} itens - "${p.primeiro}"`);
    });
  } else {
    console.log('\n✓ Nenhum pedido precisa de backfill');
  }
}

quickCheck().catch(console.error);
