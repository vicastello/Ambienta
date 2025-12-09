import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Contar por status usando agregação SQL
  const { data, error } = await (supabase as any).rpc('count_shopee_by_status');
  
  if (error) {
    // Fallback: buscar paginado
    const statusCount: Record<string, number> = {};
    let offset = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data: batch } = await (supabase as any)
        .from('shopee_orders')
        .select('order_status')
        .range(offset, offset + pageSize - 1);
      
      if (!batch?.length) break;
      
      batch.forEach((o: any) => {
        statusCount[o.order_status] = (statusCount[o.order_status] || 0) + 1;
      });
      
      offset += pageSize;
      if (batch.length < pageSize) break;
    }
    
    console.log('Status dos pedidos Shopee:');
    console.log('='.repeat(40));
    
    const total = Object.values(statusCount).reduce((a, b) => a + b, 0);
    
    Object.entries(statusCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        const pct = ((count / total) * 100).toFixed(1);
        console.log(`${status.padEnd(20)} ${String(count).padStart(6)} (${pct}%)`);
      });
    
    console.log('='.repeat(40));
    console.log(`TOTAL${' '.repeat(15)} ${String(total).padStart(6)}`);
  } else {
    console.log(data);
  }
}

main();
