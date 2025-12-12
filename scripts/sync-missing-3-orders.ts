import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/db-public';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});

const TINY_API_TOKEN = process.env.TINY_API_TOKEN!;

async function getTinyOrderItems(tinyOrderId: string) {
  const url = `https://api.tiny.com.br/api2/pedido.obter.php`;
  const params = new URLSearchParams({
    token: TINY_API_TOKEN,
    id: tinyOrderId,
    formato: 'json',
  });

  const response = await fetch(`${url}?${params}`, {
    method: 'POST',
  });

  const data = await response.json();

  if (data.retorno.status === 'OK') {
    const pedido = data.retorno.pedido;
    return pedido.itens || [];
  }

  throw new Error(`Erro ao buscar pedido ${tinyOrderId}: ${data.retorno.status_processamento}`);
}

async function sync() {
  console.log('=== SINCRONIZANDO ITENS DOS 3 PEDIDOS FALTANTES ===\n');

  const ordersToSync = [
    { id: 282804, numero: 24550, tiny_id: 943588811, shopee: '2512125908AFT6' },
    { id: 282805, numero: 24549, tiny_id: 943588795, shopee: '25121258WMFFDQ' },
    { id: 278899, numero: 24521, tiny_id: 943581841, shopee: '2512114UB02GCD' },
  ];

  for (const order of ordersToSync) {
    console.log(`\nProcessando pedido #${order.numero} (Tiny ID: ${order.tiny_id})...`);

    try {
      // Buscar itens na API do Tiny
      const items = await getTinyOrderItems(order.tiny_id.toString());
      console.log(`  Encontrados ${items.length} item(ns) na API do Tiny`);

      if (!items || items.length === 0) {
        console.log(`  ⚠ Nenhum item encontrado na API do Tiny`);
        continue;
      }

      // Inserir itens no banco
      for (const item of items) {
        const itemData = {
          id_pedido: order.id,
          id_produto_tiny: item.item.id_produto,
          codigo_produto: item.item.codigo,
          descricao: item.item.descricao,
          unidade: item.item.unidade,
          quantidade: parseFloat(item.item.quantidade),
          valor_unitario: parseFloat(item.item.valor_unitario),
          tipo: item.item.tipo || 'P',
          peso_bruto: item.item.peso_bruto ? parseFloat(item.item.peso_bruto) : null,
          classe_imposto: item.item.classe_imposto || null,
        };

        const { error } = await supabaseAdmin
          .from('tiny_pedido_itens')
          .insert(itemData);

        if (error) {
          console.log(`    ✗ Erro ao inserir item ${item.item.codigo}: ${error.message}`);
        } else {
          console.log(`    ✓ Item ${item.item.codigo} inserido`);
        }
      }

      // Atualizar timestamp de sincronização
      await supabaseAdmin
        .from('tiny_orders')
        .update({ data_pedido_itens_sincronizados: new Date().toISOString() })
        .eq('id', order.id);

      console.log(`  ✓ Pedido sincronizado com sucesso!`);

    } catch (error: any) {
      console.error(`  ✗ Erro ao processar pedido: ${error.message}`);
    }

    // Aguardar 1 segundo entre requisições para não sobrecarregar a API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n=== SINCRONIZAÇÃO CONCLUÍDA ===\n');

  // Verificar resultado
  for (const order of ordersToSync) {
    const { data: items } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id')
      .eq('id_pedido', order.id);

    console.log(`Pedido #${order.numero}: ${items?.length || 0} item(ns) cadastrado(s)`);
  }
}

sync().catch(console.error);
