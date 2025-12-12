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

async function deepInvestigate() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== INVESTIGAÇÃO PROFUNDA: PEDIDOS SEM ITENS ===\n');

  // Buscar 20 pedidos sem itens
  const { data: pedidos, error: pedidosError } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, canal, situacao, raw_payload, data_criacao')
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate)
    .limit(2000);

  if (pedidosError) {
    console.log('Erro ao buscar pedidos:', pedidosError);
    return;
  }

  if (!pedidos) {
    console.log('Nenhum pedido retornado');
    return;
  }

  // Filtrar pedidos sem itens
  const pedidoIds = pedidos.map(p => p.id);
  const { data: itens } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', pedidoIds);

  const comItens = new Set((itens || []).map(i => i.id_pedido));
  const semItens = pedidos.filter(p => !comItens.has(p.id));

  console.log(`Pedidos sem itens: ${semItens.length}\n`);
  console.log('Analisando primeiros 20 em detalhe:\n');

  for (let i = 0; i < Math.min(20, semItens.length); i++) {
    const pedido = semItens[i] as any;

    console.log(`\n=== Pedido #${pedido.numero_pedido} (ID: ${pedido.id}, Tiny: ${pedido.tiny_id}) ===`);
    console.log(`Canal: ${pedido.canal}`);
    console.log(`Situação: ${pedido.situacao}`);
    console.log(`Data: ${pedido.data_criacao}`);

    // Analisar raw_payload completo
    const payload = pedido.raw_payload;

    if (!payload) {
      console.log('❌ raw_payload é NULL');
      continue;
    }

    console.log('\nChaves no raw_payload:', Object.keys(payload).join(', '));

    // Verificar diferentes possíveis locais dos itens
    const possiveisLocais = [
      { nome: 'payload.itens', valor: payload.itens },
      { nome: 'payload.pedido', valor: payload.pedido },
      { nome: 'payload.pedido?.itens', valor: payload.pedido?.itens },
      { nome: 'payload.pedido?.itensPedido', valor: payload.pedido?.itensPedido },
      { nome: 'payload.items', valor: payload.items },
      { nome: 'payload.produtos', valor: payload.produtos },
    ];

    let encontrouItens = false;

    for (const local of possiveisLocais) {
      if (local.valor) {
        const itensArray = Array.isArray(local.valor) ? local.valor : [local.valor];
        console.log(`\n✓ Encontrado em ${local.nome}: ${itensArray.length} item(s)`);

        // Mostrar primeiro item
        if (itensArray.length > 0 && itensArray[0]) {
          const primeiroItem = itensArray[0];
          console.log('  Estrutura do primeiro item:', JSON.stringify(primeiroItem, null, 2).substring(0, 300));
        }

        encontrouItens = true;
        break;
      }
    }

    if (!encontrouItens) {
      console.log('\n❌ NENHUM ITEM ENCONTRADO em locais conhecidos');
      console.log('Payload completo (primeiros 500 chars):');
      console.log(JSON.stringify(payload, null, 2).substring(0, 500));
    }
  }

  // Estatísticas gerais
  console.log('\n\n=== ESTATÍSTICAS GERAIS ===');

  const situacoes = new Map<number, number>();
  const canais = new Map<string, number>();

  semItens.forEach((p: any) => {
    situacoes.set(p.situacao, (situacoes.get(p.situacao) || 0) + 1);
    canais.set(p.canal || 'null', (canais.get(p.canal || 'null') || 0) + 1);
  });

  console.log('\nDistribuição por situação:');
  Array.from(situacoes.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([sit, count]) => {
      console.log(`  Situação ${sit}: ${count} pedidos`);
    });

  console.log('\nDistribuição por canal:');
  Array.from(canais.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([canal, count]) => {
      console.log(`  ${canal}: ${count} pedidos`);
    });
}

deepInvestigate().catch(console.error);
