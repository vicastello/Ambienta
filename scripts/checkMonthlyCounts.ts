
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

const envFiles = ['.env.development.local', '.env.local', '.env'];
for (const file of envFiles) {
    config({ path: resolve(process.cwd(), file), override: true });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
    console.log('📊 Verificando contagem mensal de pedidos Shopee (2025)...\n');

    // Supabase (Postgrest) doesn't support easy "GROUP BY" via client without RPC.
    // We'll fetch all create_time for 2025 and aggregate in memory (efficient enough for < 50k rows).

    const { data, error } = await supabase
        .from('shopee_orders')
        .select('create_time')
        .gte('create_time', '2025-01-01T00:00:00')
        .lt('create_time', '2026-01-01T00:00:00');

    if (error) {
        console.error('Erro:', error);
        return;
    }

    const counts: Record<string, number> = {};
    const months = [
        '01-Janeiro', '02-Fevereiro', '03-Março', '04-Abril', '05-Maio', '06-Junho',
        '07-Julho', '08-Agosto', '09-Setembro', '10-Outubro', '11-Novembro', '12-Dezembro'
    ];

    // Initialize
    months.forEach(m => counts[m] = 0);

    data.forEach(order => {
        // create_time may be string (ISO) or number (timestamp) depending on ingestion, but verified as string in previous steps
        const date = new Date(order.create_time);
        const monthIndex = date.getMonth(); // 0-11
        counts[months[monthIndex]]++;
    });

    console.log('Mês         | Pedidos');
    console.log('------------|--------');
    months.forEach(m => {
        const count = counts[m];
        const status = count < 100 ? '⚠️ BAIXO/ZERO' : '✅ OK';
        console.log(`${m.padEnd(12)}| ${count.toString().padEnd(7)} ${status}`);
    });
}

check().catch(console.error);
