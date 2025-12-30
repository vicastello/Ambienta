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
            let val = current.trim();
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.substring(1, val.length - 1);
            }
            result.push(val);
            current = '';
        } else {
            current += char;
        }
    }

    let val = current.trim();
    if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
    }
    result.push(val);
    return result;
}

async function backfillFromCSV() {
    const importDirs = [
        '/Users/vitorcastello/projetos/gestor-tiny/Historico/importados',
        '/Users/vitorcastello/projetos/gestor-tiny/Historico'
    ];

    // Find all CSV files from both directories
    const allFiles: string[] = [];
    for (const dir of importDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv') && !f.includes('cópia'));
        files.forEach(f => allFiles.push(path.join(dir, f)));
    }

    console.log(`Found ${allFiles.length} CSV files.\n`);

    // Build mapping from Numero Pedido (Internal) to Ecommerce Order ID
    const mapping: Map<string, string> = new Map();

    for (const file of allFiles) {
        const filePath = path.join(file); // file is already a full path
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        // Parse header
        const header = parseCSVLine(lines[0]);
        // Use "Número do pedido" for matching instead of ID
        const idIndex = header.findIndex(h => h.trim() === 'Número do pedido');
        const ecommerceIndex = header.findIndex(h => h.toLowerCase().includes('ordem de compra'));

        if (idIndex === -1 || ecommerceIndex === -1) {
            console.log(`[SKIP] ${file} - columns not found (idIndex: ${idIndex}, ecommerceIndex: ${ecommerceIndex})`);
            continue;
        }

        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = parseCSVLine(line);
            const numeroPedido = values[idIndex];
            const ecommerceId = values[ecommerceIndex];

            if (numeroPedido && ecommerceId && !mapping.has(numeroPedido)) {
                mapping.set(numeroPedido, ecommerceId);
            }
        }

        console.log(`[OK] ${file} - ${mapping.size} total mappings`);
    }

    console.log(`\nTotal unique mappings by Numero Pedido: ${mapping.size}`);

    // Process all missing orders in batches
    let totalUpdated = 0;
    let totalNotFound = 0;

    let keepProcessing = true;
    let iterations = 0;

    while (keepProcessing && iterations < 50) { // Safety cap
        iterations++;
        console.log(`\nBatch ${iterations}: Fetching up to 1000 orders...`);

        const { data: ordersToFix } = await supabase
            .from('tiny_orders')
            .select('id, tiny_id, numero_pedido')
            .is('numero_pedido_ecommerce', null)
            .order('numero_pedido', { ascending: true })
            .limit(1000);

        if (!ordersToFix || ordersToFix.length === 0) {
            keepProcessing = false;
            break;
        }

        console.log(`  Processing ${ordersToFix.length} orders...`);

        let batchUpdated = 0;
        let batchNotFound = 0;

        for (const order of ordersToFix) {
            const key = String(order.numero_pedido);
            const ecommerceId = mapping.get(key);

            if (ecommerceId) {
                const { error } = await supabase
                    .from('tiny_orders')
                    .update({ numero_pedido_ecommerce: ecommerceId })
                    .eq('id', order.id);

                if (!error) {
                    batchUpdated++;
                    totalUpdated++;
                }
            } else {
                batchNotFound++;
                totalNotFound++;
            }
        }

        console.log(`  Updated: ${batchUpdated}, Not Found: ${batchNotFound}`);

        if (batchUpdated === 0 && batchNotFound === ordersToFix.length) {
            // Cannot fix these orders with current files. 
            // We must break to avoid infinite loop of fetching the same 1000 orders.
            console.log("  No updates in this batch. Breaking loop as we cannot fix these orders.");
            keepProcessing = false;
        }
    }

    console.log(`\n=== Final Summary ===`);
    console.log(`Total Updated: ${totalUpdated}`);
    console.log(`Total Not Found: ${totalNotFound}`);
}

backfillFromCSV().catch(console.error);
