import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env.development.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspectJanuaryIssues() {
    console.log('Inspecting Jan 2025 orders...');

    const start = '2025-01-01';
    const end = '2025-01-31';

    const { data: orders, error } = await supabase
        .from('tiny_orders')
        .select(`
            id, 
            tiny_id,
            numero_pedido, 
            data_criacao, 
            valor, 
            valor_total_pedido, 
            canal, 
            payment_received
        `)
        .gte('data_criacao', start)
        .lte('data_criacao', end)
        .or('payment_received.is.null,payment_received.eq.false');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${orders.length} unpaid/pending orders in Jan 2025.`);

    let missingCanal = 0;
    let zeroValue = 0;

    orders.forEach(o => {
        const canal = o.canal?.toLowerCase() || '';
        const marketplace = (canal.includes('shopee') || canal.includes('mercado') || canal.includes('meli') || canal.includes('magalu') || canal.includes('magazine')) ? 'valid' : null;

        const val = o.valor || o.valor_total_pedido || 0;

        if (!marketplace) {
            missingCanal++;
            // console.log(`Order ${o.numero_pedido}: Missing/Unknown Canal (${o.canal})`);
        }
        if (val <= 0) {
            zeroValue++;
            console.log(`Order ${o.numero_pedido}: Zero Value (${val})`);
        }
    });

    console.log(`\nSummary:`);
    console.log(`  Missing/Unknown Canal: ${missingCanal}`);
    console.log(`  Zero Value: ${zeroValue}`);

    // Sample of unknown canals
    const unknownCanals = new Set();
    const sampleIds: number[] = [];

    orders.forEach(o => {
        const canal = o.canal?.toLowerCase() || '';
        const marketplace = (canal.includes('shopee') || canal.includes('mercado') || canal.includes('meli') || canal.includes('magalu') || canal.includes('magazine')) ? 'valid' : null;
        if (!marketplace) {
            unknownCanals.add(o.canal);
            if (sampleIds.length < 5) sampleIds.push(o.id);
        }
    });
    console.log(`\nUnknown Canals:`, Array.from(unknownCanals));
    // @ts-ignore
    console.log(`Sample Tiny IDs:`, sampleIds.map(id => orders.find(o => o.id === id)?.tiny_id));
    console.log(`Sample Numbers:`, orders.slice(0, 5).map(o => o.numero_pedido));
}

inspectJanuaryIssues().catch(console.error);
