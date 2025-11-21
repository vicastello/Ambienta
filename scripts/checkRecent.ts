#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key);

async function main() {
  const { data } = await db
    .from('tiny_orders')
    .select('tiny_id, numero_pedido, data_criacao, valor_frete, canal, raw')
    .order('data_criacao', { ascending: false })
    .limit(10);

  console.log('\n🔍 Últimos 10 pedidos importados:\n');
  data?.forEach((o, i) => {
    console.log(`${i+1}. Pedido #${o.numero_pedido || o.tiny_id} | Data: ${o.data_criacao}`);
    console.log(`   Frete DB: ${o.valor_frete !== null ? 'R$ ' + o.valor_frete : '❌ NULL'}`);
    console.log(`   Canal DB: ${o.canal || '❌ NULL'}`);
    console.log(`   RAW tem valorFrete? ${o.raw?.valorFrete ? '✅ ' + o.raw.valorFrete : '❌'}`);
    console.log(`   RAW tem transportador.valorFrete? ${o.raw?.transportador?.valorFrete ? '✅ ' + o.raw.transportador.valorFrete : '❌'}`);
    console.log(`   RAW tem canal? ${o.raw?.canal ? '✅ ' + o.raw.canal : '❌'}`);
    console.log(`   RAW tem ecommerce.canal? ${o.raw?.ecommerce?.canal ? '✅ ' + o.raw.ecommerce.canal : '❌'}`);
    console.log('');
  });

  // Stats
  const total = data?.length || 0;
  const comFrete = data?.filter(o => o.valor_frete !== null && o.valor_frete > 0).length || 0;
  const comCanal = data?.filter(o => o.canal && o.canal !== 'Outros').length || 0;

  console.log(`📊 Estatísticas:`);
  console.log(`   Total: ${total} pedidos`);
  console.log(`   Com frete: ${comFrete} (${(comFrete/total*100).toFixed(1)}%)`);
  console.log(`   Com canal válido: ${comCanal} (${(comCanal/total*100).toFixed(1)}%)`);
}

main().catch(console.error);
