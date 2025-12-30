import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Parse CSV line handling quoted values
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

async function debugMatching() {
    // Get sample of orders missing ecommerce ID
    const { data: ordersToFix } = await supabase
        .from('tiny_orders')
        .select('id, tiny_id, numero_pedido')
        .is('numero_pedido_ecommerce', null)
        .limit(5);

    console.log('Sample orders missing ecommerce ID in DB:');
    ordersToFix?.forEach(o => {
        console.log(`  tiny_id: ${o.tiny_id}, numero_pedido: ${o.numero_pedido}`);
    });

    // Read first CSV and get sample mappings
    const filePath = '/Users/vitorcastello/projetos/gestor-tiny/Historico/importados/pedidos_venda_1-500.csv';
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    console.log('\nSample mappings from CSV:');
    for (let i = 1; i <= 5; i++) {
        const values = parseCSVLine(lines[i]);
        console.log(`  ID (tiny_id): ${values[0]}, Ordem: ${values[29]}`);
    }

    // Check if any of the DB tiny_ids exist in CSV
    const mapping = new Map<string, string>();
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values[0] && values[29]) {
            mapping.set(values[0], values[29]);
        }
    }

    console.log('\nChecking if DB tiny_ids exist in CSV:');
    for (const order of (ordersToFix || [])) {
        const key = String(order.tiny_id);
        const found = mapping.has(key);
        console.log(`  ${key}: ${found ? 'FOUND -> ' + mapping.get(key) : 'NOT FOUND'}`);
    }

    // Check date ranges
    const { data: dateRange } = await supabase
        .from('tiny_orders')
        .select('data_criacao')
        .is('numero_pedido_ecommerce', null)
        .order('data_criacao', { ascending: true })
        .limit(1);

    const { data: dateRangeEnd } = await supabase
        .from('tiny_orders')
        .select('data_criacao')
        .is('numero_pedido_ecommerce', null)
        .order('data_criacao', { ascending: false })
        .limit(1);

    console.log('\nDate range of orders missing ecommerce ID:');
    console.log(`  Oldest: ${dateRange?.[0]?.data_criacao}`);
    console.log(`  Newest: ${dateRangeEnd?.[0]?.data_criacao}`);
}

debugMatching().catch(console.error);
