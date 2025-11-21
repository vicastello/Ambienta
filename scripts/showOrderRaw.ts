import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const numero = Number(process.argv[2]);

if (!numero) {
  console.error('Uso: npx tsx scripts/showOrderRaw.ts <numero_pedido>');
  process.exit(1);
}

async function main() {
  const { data, error } = await supabase
    .from('tiny_orders')
    .select('tiny_id, numero_pedido, valor, valor_frete, raw')
    .eq('numero_pedido', numero)
    .limit(1)
    .single();

  if (error || !data) {
    console.error('Pedido não encontrado ou erro:', error?.message);
    return;
  }

  console.log(`\nPedido #${data.numero_pedido} | Tiny ID ${data.tiny_id}`);
  console.log(`Valor: ${data.valor}`);
  console.log(`Valor frete: ${data.valor_frete}`);
  console.log('\nRAW:');
  console.log(JSON.stringify(data.raw, null, 2));
}

main().catch(console.error);
