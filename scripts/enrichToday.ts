import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TINY_API_BASE = 'https://api.tiny.com.br/public-api/v3';
const REQUESTS_PER_MINUTE = 120;
const DELAY_MS = Math.ceil(60000 / REQUESTS_PER_MINUTE); // ~500ms entre chamadas

let requestCount = 0;
let windowStart = Date.now();

async function rateLimitedFetch(url: string, token: string) {
  const now = Date.now();
  
  // Reset counter a cada minuto
  if (now - windowStart >= 60000) {
    console.log(`[Rate Limit] Janela resetada. Requisições no último minuto: ${requestCount}`);
    requestCount = 0;
    windowStart = now;
  }
  
  // Aguardar se atingiu o limite
  if (requestCount >= REQUESTS_PER_MINUTE) {
    const waitTime = 60000 - (now - windowStart);
    console.log(`[Rate Limit] Limite atingido (${REQUESTS_PER_MINUTE}). Aguardando ${Math.ceil(waitTime/1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime + 1000));
    requestCount = 0;
    windowStart = Date.now();
  }
  
  // Delay entre requisições
  await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  
  requestCount++;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  
  // Retry em caso de 429
  if (res.status === 429) {
    console.log(`[Rate Limit] 429 recebido. Aguardando 60s...`);
    await new Promise(resolve => setTimeout(resolve, 60000));
    requestCount = 0;
    windowStart = Date.now();
    return rateLimitedFetch(url, token);
  }
  
  return res;
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase
    .from('tiny_tokens')
    .select('access_token, expires_at')
    .eq('id', 1)
    .single();

  if (error || !data?.access_token) {
    throw new Error('Token não encontrado no banco');
  }

  const now = Date.now();
  if (data.expires_at && data.expires_at < now) {
    throw new Error('Token expirado. Execute: POST /api/tiny/auth/refresh');
  }

  return data.access_token;
}

async function enrichTodayOrders() {
  console.log('🚀 Iniciando enrichment dos pedidos de hoje...\n');
  
  const token = await getAccessToken();
  const today = '2025-11-21';
  
  // Buscar pedidos de hoje sem frete
  const { data: orders, error } = await supabase
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, valor_frete')
    .gte('data_criacao', today)
    .lt('data_criacao', '2025-11-22')
    .or('valor_frete.is.null,valor_frete.eq.0')
    .order('id', { ascending: true });

  if (error) {
    console.error('❌ Erro ao buscar pedidos:', error);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log('✅ Todos os pedidos de hoje já têm frete!');
    return;
  }

  console.log(`📦 Encontrados ${orders.length} pedidos sem frete\n`);
  console.log(`⏱️  Rate limit: ${REQUESTS_PER_MINUTE} req/min (~${DELAY_MS}ms entre chamadas)\n`);
  console.log(`⏰ Tempo estimado: ${Math.ceil(orders.length * DELAY_MS / 60000)} minutos\n`);
  
  let enriched = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const progress = `[${i + 1}/${orders.length}]`;
    
    try {
      console.log(`${progress} Buscando pedido ${order.numero_pedido || order.tiny_id}...`);
      
      const res = await rateLimitedFetch(
        `${TINY_API_BASE}/pedidos/${order.tiny_id}`,
        token
      );
      
      if (!res.ok) {
        const text = await res.text();
        console.log(`   ⚠️  Erro ${res.status}: ${text.substring(0, 100)}`);
        failed++;
        continue;
      }
      
      const json = await res.json();
      const pedido = json; // A API retorna direto, não tem .data
      
      if (!pedido) {
        console.log(`   ⚠️  Sem dados`);
        skipped++;
        continue;
      }
      
      const valorFrete = pedido.valorFrete ? Number(pedido.valorFrete) : 0;
      
      if (valorFrete > 0) {
        await supabase
          .from('tiny_orders')
          .update({
            valor_frete: valorFrete,
            raw: pedido,
            is_enriched: true
          })
          .eq('id', order.id);
        
        console.log(`   ✅ Frete: R$ ${valorFrete.toFixed(2)}`);
        enriched++;
      } else {
        console.log(`   ⚪ Sem frete (R$ 0.00)`);
        
        // Atualizar raw mesmo sem frete
        await supabase
          .from('tiny_orders')
          .update({
            raw: pedido,
            is_enriched: true
          })
          .eq('id', order.id);
        
        skipped++;
      }
      
    } catch (err: any) {
      console.log(`   ❌ Erro: ${err.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMO FINAL:');
  console.log('='.repeat(50));
  console.log(`Total processados: ${orders.length}`);
  console.log(`✅ Enriquecidos com frete: ${enriched}`);
  console.log(`⚪ Sem valor de frete: ${skipped}`);
  console.log(`❌ Falhas: ${failed}`);
  console.log(`📈 Taxa de sucesso: ${Math.round((enriched / orders.length) * 100)}%`);
  console.log(`⏱️  Requisições realizadas: ${requestCount}`);
}

enrichTodayOrders().catch(console.error);
