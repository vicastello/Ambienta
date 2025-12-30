
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

const envFiles = ['.env.development.local', '.env.local', '.env'];
for (const file of envFiles) {
    config({ path: resolve(process.cwd(), file), override: true });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
    console.log('📊 Verificando TODAS as datas (sem filtro)...');

    const { data, error } = await supabase
        .from('shopee_orders')
        .select('create_time')
        .limit(20000); // Trazer volume maior

    if (error) {
        console.error('Erro:', error);
        return;
    }

    const counts: Record<string, number> = {};
    data.forEach(item => {
        const d = new Date(item.create_time);
        if (d.getFullYear() === 2025) {
            const m = d.getMonth() + 1; // 1-12
            const key = m.toString().padStart(2, '0');
            counts[key] = (counts[key] || 0) + 1;
        }
    });

    console.log('Mês | Qtd');
    Object.keys(counts).sort().forEach(k => {
        console.log(`${k}  | ${counts[k]}`);
    });
}

check();
