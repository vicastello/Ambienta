import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  "https://znoiauhdrujwkfryhwiz.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpub2lhdWhkcnVqd2tmcnlod2l6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzM5ODEyNywiZXhwIjoyMDc4OTc0MTI3fQ.J1GFCdU1Fb9Jc5NlQSHkI7vsvXPWbE3l6h-17KLPsZQ"
);

async function check() {
  // Total
  const { data: total, error: error1 } = await supabase
    .from('tiny_orders')
    .select('id')
    .limit(1);
  
  console.log('✅ Conexão:', total ? `OK (sample: ${total[0]?.id})` : 'ERRO');
  if (error1) console.log('Erro:', error1);
  
  // Com frete
  const { count: withFrete, error: error2 } = await supabase
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .gt('valor_frete', 0);
  
  console.log('📦 Com frete:', withFrete);
  if (error2) console.log('Erro:', error2);
  
  // Sem frete
  const { count: noFrete, error: error3 } = await supabase
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .or('valor_frete.is.null,valor_frete.eq.0');
  
  console.log('❌ Sem frete:', noFrete);
  if (error3) console.log('Erro:', error3);
  
  // Total count
  const { count: allOrders, error: error4 } = await supabase
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true });
  
  console.log('📊 Total:', allOrders);
  if (error4) console.log('Erro:', error4);
}

check();
