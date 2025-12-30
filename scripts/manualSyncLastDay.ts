
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { listarPedidosTinyPorPeriodo } from '../lib/tinyApi';
import { mapPedidoToOrderRow } from '../lib/tinyMapping';
import { upsertOrdersPreservingEnriched } from '../lib/syncProcessor';

async function syncTinyValues(token: string, days: number) {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const dataInicial = startDate.toISOString().split('T')[0];
    const dataFinal = now.toISOString().split('T')[0];

    console.log(`\n📦 Buscando pedidos Tiny de ${dataInicial} a ${dataFinal}...`);

    let total = 0;
    let offset = 0;

    while (true) {
        const response = await listarPedidosTinyPorPeriodo(token, {
            dataInicial,
            dataFinal,
            limit: 100,
            offset
        }, 'manual_sync_last_day');

        const pedidos = response?.itens || [];
        if (pedidos.length === 0) break;

        const rows = pedidos.map(mapPedidoToOrderRow);
        await upsertOrdersPreservingEnriched(rows);

        total += pedidos.length;
        offset += 100;
        process.stdout.write(`.`);
    }
    console.log(`\n✅ Tiny: ${total} pedidos sincronizados.`);
}

async function triggerMarketplaceSync(name: string, endpoint: string) {
    try {
        console.log(`\n🚀 Disparando sync ${name}...`);
        const res = await fetch(`http://localhost:3000/api/marketplaces/${endpoint}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ periodDays: 1, force: true }) // 1 dia
        });

        if (res.ok) {
            const json = await res.json();
            console.log(`✅ ${name} OK:`, json.data ?
                `Inseridos: ${json.data.ordersInserted ?? 0}, Atualizados: ${json.data.ordersUpdated ?? 0}` : 'Concluído');
        } else {
            console.error(`❌ ${name} Falhou: ${res.status} ${res.statusText}`);
        }
    } catch (e: any) {
        if (e.code === 'ECONNREFUSED') {
            console.log(`⚠️  Não foi possível conectar ao servidor local (${name}). O 'npm run dev' está rodando?`);
        } else {
            console.error(`❌ Erro ${name}:`, e.message);
        }
    }
}

async function main() {
    console.log('🔄 Sincronizando dados das últimas 24h...');

    // 1. Tiny
    try {
        const token = await getAccessTokenFromDbOrRefresh();
        await syncTinyValues(token, 1);
    } catch (e: any) {
        console.error('❌ Erro Tiny:', e.message);
    }

    // 2. Marketplaces
    await triggerMarketplaceSync('Shopee', 'shopee');
    await triggerMarketplaceSync('Mercado Livre', 'mercado-livre');
    await triggerMarketplaceSync('Magalu', 'magalu');

    console.log('\n🏁 Concluído.');
}

main();
