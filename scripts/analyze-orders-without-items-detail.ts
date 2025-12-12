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

async function analyze() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== ANÁLISE DETALHADA: PEDIDOS SEM ITENS ===\n');

  // Buscar pedidos sem itens usando LEFT JOIN
  const { data: pedidosSemItens } = await supabaseAdmin
    .from('tiny_orders')
    .select(`
      id,
      tiny_id,
      numero_pedido,
      data_criacao,
      canal,
      situacao,
      raw_payload,
      tiny_pedido_itens!left(id)
    `)
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate)
    .is('tiny_pedido_itens.id', null)
    .limit(100);

  console.log(`Pedidos sem itens encontrados: ${pedidosSemItens?.length || 0}\n`);

  if (!pedidosSemItens || pedidosSemItens.length === 0) {
    console.log('✓ Nenhum pedido sem itens encontrado!');
    return;
  }

  // Analisar primeiros 10
  console.log('Analisando primeiros 10 pedidos:\n');

  for (let i = 0; i < Math.min(10, pedidosSemItens.length); i++) {
    const pedido = pedidosSemItens[i] as any;
    console.log(`\n--- Pedido #${pedido.numero_pedido} (ID: ${pedido.id}) ---`);
    console.log(`Data: ${pedido.data_criacao}`);
    console.log(`Canal: ${pedido.canal}`);
    console.log(`Situação: ${pedido.situacao}`);

    // Verificar se tem itens no raw_payload
    if (pedido.raw_payload?.pedido?.itens) {
      const itens = Array.isArray(pedido.raw_payload.pedido.itens)
        ? pedido.raw_payload.pedido.itens
        : [pedido.raw_payload.pedido.itens];

      console.log(`Itens no raw_payload: ${itens.length}`);

      if (itens.length > 0) {
        console.log('⚠️  PROBLEMA: Tem itens no raw_payload mas não na tabela tiny_pedido_itens!');
        itens.forEach((item: any, idx: number) => {
          console.log(`  ${idx + 1}. ${item.item?.descricao || 'sem nome'} - SKU: ${item.item?.codigo || 'N/A'} - Qtd: ${item.item?.quantidade || 0}`);
        });
      } else {
        console.log('✓ raw_payload também não tem itens');
      }
    } else {
      console.log('✓ raw_payload não tem itens (pedido sem produtos)');
    }
  }

  // Estatísticas
  console.log('\n\n=== ESTATÍSTICAS ===');

  let comItensNoPayload = 0;
  let semItensNoPayload = 0;
  let payloadNulo = 0;

  for (const pedido of pedidosSemItens as any[]) {
    if (!pedido.raw_payload) {
      payloadNulo++;
    } else if (pedido.raw_payload?.pedido?.itens) {
      const itens = Array.isArray(pedido.raw_payload.pedido.itens)
        ? pedido.raw_payload.pedido.itens
        : [pedido.raw_payload.pedido.itens];

      if (itens.length > 0) {
        comItensNoPayload++;
      } else {
        semItensNoPayload++;
      }
    } else {
      semItensNoPayload++;
    }
  }

  console.log(`Total analisado: ${pedidosSemItens.length}`);
  console.log(`Com itens no raw_payload (precisam backfill): ${comItensNoPayload}`);
  console.log(`Sem itens no raw_payload (OK): ${semItensNoPayload}`);
  console.log(`Payload nulo: ${payloadNulo}`);

  if (comItensNoPayload > 0) {
    console.log(`\n⚠️  ${comItensNoPayload} pedidos precisam de backfill!`);
  }
}

analyze().catch(console.error);
