import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/db-public';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const tinyToken = process.env.TINY_API_TOKEN!;

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function obterPedidoDetalhado(tinyId: number) {
  const response = await fetch(`https://api.tiny.com.br/api2/pedido.obter.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: tinyToken,
      id: tinyId.toString(),
      formato: 'json',
    }),
  });

  const data = await response.json();

  if (data.retorno.status === 'Erro') {
    throw new Error(data.retorno.erros?.[0]?.erro || 'Erro desconhecido');
  }

  return data.retorno.pedido;
}

async function salvarItens(localId: number, tinyId: number) {
  try {
    const pedido = await obterPedidoDetalhado(tinyId);

    if (!pedido.itens) {
      return 0; // Sem itens
    }

    const itensArray = Array.isArray(pedido.itens) ? pedido.itens : [pedido.itens];

    if (itensArray.length === 0) {
      return 0;
    }

    const itensToInsert = itensArray.map((item: any) => ({
      id_pedido: localId,
      id_produto_tiny: item.item?.id_produto ? Number(item.item.id_produto) : null,
      codigo_produto: item.item?.codigo || null,
      nome_produto: item.item?.descricao || 'Produto sem nome',
      quantidade: Number(item.item?.quantidade || 0),
      valor_unitario: Number(item.item?.valor_unidade || 0),
      valor_total: Number(item.item?.valor_total || 0),
      info_adicional: null,
    }));

    const { error } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .insert(itensToInsert);

    if (error) {
      console.error(`Erro ao inserir itens:`, error);
      return null;
    }

    return itensToInsert.length;
  } catch (error: any) {
    console.error(`Erro ao buscar pedido ${tinyId}:`, error.message);
    return null;
  }
}

async function main() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== BACKFILL SIMPLES ===\n');

  // Buscar pedidos sem itens
  console.log('1. Buscando pedidos sem itens...');

  const { data: allPedidos } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, canal')
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate);

  if (!allPedidos) {
    console.log('Erro ao buscar pedidos');
    return;
  }

  const { data: allItens } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', allPedidos.map(p => p.id));

  const pedidosComItens = new Set((allItens || []).map(i => i.id_pedido));
  const pedidosSemItens = allPedidos.filter(p => !pedidosComItens.has(p.id));

  console.log(`   Encontrados: ${pedidosSemItens.length} pedidos sem itens\n`);

  if (pedidosSemItens.length === 0) {
    console.log('✓ Nada a fazer!');
    return;
  }

  // Processar
  console.log('2. Processando...\n');

  let sucesso = 0;
  let vazios = 0;
  let falhas = 0;

  for (let i = 0; i < pedidosSemItens.length; i++) {
    const p = pedidosSemItens[i];

    console.log(`[${i + 1}/${pedidosSemItens.length}] #${p.numero_pedido} (Tiny: ${p.tiny_id})`);

    const result = await salvarItens(p.id, p.tiny_id);

    if (result === null) {
      console.log(`   ✗ Falha`);
      falhas++;
    } else if (result === 0) {
      console.log(`   ○ Vazio`);
      vazios++;
    } else {
      console.log(`   ✓ ${result} itens`);
      sucesso++;
    }

    if (i < pedidosSemItens.length - 1) {
      await delay(600);
    }

    if ((i + 1) % 50 === 0) {
      console.log(`\n   📊 Progresso: ${sucesso} OK, ${vazios} vazios, ${falhas} falhas\n`);
    }
  }

  console.log('\n=== RESULTADO ===');
  console.log(`Sucesso: ${sucesso}`);
  console.log(`Vazios: ${vazios}`);
  console.log(`Falhas: ${falhas}`);
}

main().catch(console.error);
