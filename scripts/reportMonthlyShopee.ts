
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

const envFiles = ['.env.development.local', '.env.local', '.env'];
for (const file of envFiles) {
    config({ path: resolve(process.cwd(), file), override: true });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
    console.log('📊 Relatório Final de Importação Shopee (2025)...\n');

    // Fetch ALL create_time for 2025
    const { data, error } = await supabase
        .from('shopee_orders')
        .select('create_time')
        .limit(50000); // Should cover all ~25k orders

    if (error) {
        console.error('Erro:', error);
        return;
    }

    const counts: Record<string, number> = {};
    const months = [
        '01-Janeiro', '02-Fevereiro', '03-Março', '04-Abril', '05-Maio', '06-Junho',
        '07-Julho', '08-Agosto', '09-Setembro', '10-Outubro', '11-Novembro', '12-Dezembro'
    ];

    months.forEach(m => counts[m] = 0);

    data.forEach(order => {
        const date = new Date(order.create_time);
        if (date.getFullYear() === 2025) {
            const monthIndex = date.getMonth();
            counts[months[monthIndex]]++;
        }
    });

    console.log('Mês         | Pedidos  | Status');
    console.log('------------|----------|--------');

    let total = 0;
    months.forEach(m => {
        const count = counts[m];
        total += count;
        const status = count > 100 ? '✅ OK' : '⚠️ ATENÇÃO';
        console.log(`${m.padEnd(12)}| ${count.toString().padEnd(8)} | ${status}`);
    });

    console.log('\n-----------------------------');
    console.log(`TOTAL 2025  | ${total}`);
}

check().catch(console.error);
