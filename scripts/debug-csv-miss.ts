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

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else current += char;
    }
    result.push(current.trim());
    return result;
}

async function debugSpecificOrder() {
    const targetOrder = '5084';

    // Check order in DB
    const { data: order } = await supabase
        .from('tiny_orders')
        .select('*')
        .eq('numero_pedido', 5084)
        .single();

    console.log('DB Order #5084:', order);

    // Check CSV file
    const searchDirs = [
        '/Users/vitorcastello/projetos/gestor-tiny/Historico/importados',
        '/Users/vitorcastello/projetos/gestor-tiny/Historico'
    ];

    let foundInCsv = false;

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;

        try {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv'));

            for (const file of files) {
                // Check if file name might contain the range
                if (file.includes('5001-5500')) {
                    console.log(`\nChecking file: ${file}`);
                    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
                    const lines = content.split('\n');

                    const header = parseCSVLine(lines[0]);
                    const idIndex = header.findIndex(h => h.trim() === 'Número do pedido');
                    const ecommerceIndex = header.findIndex(h => h.toLowerCase().includes('ordem de compra'));

                    console.log(`  Header indices - NumPedido: ${idIndex}, Ecomm: ${ecommerceIndex}`);
                    console.log(`  Header columns: ${JSON.stringify(header)}`);

                    // Look for 5084
                    for (let i = 1; i < lines.length; i++) {
                        const vals = parseCSVLine(lines[i]);
                        if (vals[idIndex] === targetOrder) {
                            console.log(`  ✅ FOUND in line ${i + 1}:`);
                            console.log(`  Num: ${vals[idIndex]}`);
                            console.log(`  Ecomm: ${vals[ecommerceIndex]}`);
                            foundInCsv = true;
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    if (!foundInCsv) {
        console.log(`\n❌ Order 5084 NOT found in any 5001-5500 csv file.`);
    }

    // Check max order date
    const { data: maxOrder } = await supabase
        .from('tiny_orders')
        .select('numero_pedido, data_criacao')
        .eq('numero_pedido', 15032)
        .single();

    console.log(`\nMax missing order #15032 date: ${maxOrder?.data_criacao}`);
}

debugSpecificOrder().catch(console.error);
