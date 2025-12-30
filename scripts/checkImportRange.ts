
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Carregar variáveis de ambiente
const envFiles = ['.env.development.local', '.env.local', '.env'];
for (const file of envFiles) {
    config({ path: resolve(process.cwd(), file), override: true });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
    console.log('Verificando intervalo de datas dos pedidos importados recentemente...');

    // Verificar pedidos atualizados nos últimos 60 minutos (para garantir)
    const timeWindow = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('shopee_orders')
        .select('create_time, order_sn')
        .gte('updated_at', timeWindow)
        .order('create_time', { ascending: false });

    if (error) {
        console.error('Erro Supabase:', error);
        return;
    }

    if (data && data.length > 0) {
        const min = new Date(data[0].create_time).toLocaleString('pt-BR');
        const max = new Date(data[data.length - 1].create_time).toLocaleString('pt-BR');

        console.log(`\n📊 Resumo da Importação Recente:`);
        console.log(`   Pedidos Processados: ${data.length}`);
        console.log(`   Data Mais Antiga: ${min}`);
        console.log(`   Data Mais Recente: ${max}`);

        // Amostra
        console.log(`\nExemplos:`);
        console.log(`   Primeiro: ${data[0].order_sn}`);
        console.log(`   Último: ${data[data.length - 1].order_sn}`);
    } else {
        console.log('Nenhum pedido encontrado nos últimos 60 min.');
    }
}

check().catch(console.error);
