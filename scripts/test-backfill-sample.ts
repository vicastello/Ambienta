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

async function testBackfill() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== TESTE: BACKFILL DE 10 PEDIDOS ===\n');

  // Buscar pedidos sem itens
  const { data: pedidos } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, canal')
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate)
    .limit(100);

  if (!pedidos) {
    console.log('Nenhum pedido encontrado');
    return;
  }

  // Filtrar os que não têm itens
  const pedidosSemItens: any[] = [];

  for (const pedido of pedidos) {
    const { data: itens } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id')
      .eq('id_pedido', pedido.id)
      .limit(1);

    if (!itens || itens.length === 0) {
      pedidosSemItens.push(pedido);
      if (pedidosSemItens.length >= 10) break;
    }
  }

  console.log(`Encontrados ${pedidosSemItens.length} pedidos sem itens para testar\n`);

  let sucesso = 0;
  let semItens = 0;
  let falha = 0;

  for (let i = 0; i < pedidosSemItens.length; i++) {
    const pedido = pedidosSemItens[i];

    console.log(`[${i + 1}/${pedidosSemItens.length}] Pedido #${pedido.numero_pedido} (Tiny ID: ${pedido.tiny_id})`);

    try {
      const qtdItens = await salvarItensPedido(
        accessToken,
        pedido.tiny_id,
        pedido.id,
        { context: 'test-backfill' }
      );

      if (qtdItens === null) {
        console.log(`   ✗ Falha ao buscar`);
        falha++;
      } else if (qtdItens === 0) {
        console.log(`   ○ Sem itens (vazio/cancelado)`);
        semItens++;
      } else {
        console.log(`   ✓ ${qtdItens} itens salvos!`);
        sucesso++;
      }
    } catch (error: any) {
      console.log(`   ✗ Erro: ${error.message}`);
      falha++;
    }

    if (i < pedidosSemItens.length - 1) {
      await delay(600);
    }
  }

  console.log('\n=== RESULTADO DO TESTE ===');
  console.log(`Sucesso: ${sucesso}`);
  console.log(`Sem itens: ${semItens}`);
  console.log(`Falhas: ${falha}`);
}

testBackfill().catch(console.error);
