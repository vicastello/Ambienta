import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function analyzeImport() {
    const filePath = '/Users/vitorcastello/Downloads/my_balance_transaction_report.shopee.20250401_20250430 (2).xlsx';

    console.log('Reading file...');
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    console.log(`Total rows in file: ${rows.length}`);

    // Find header row
    let headerIndex = 0;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        if (row && Array.isArray(row) && row.some(cell =>
            typeof cell === 'string' &&
            (cell.toLowerCase().includes('data') || cell.toLowerCase().includes('date'))
        )) {
            headerIndex = i;
            break;
        }
    }

    const headers = rows[headerIndex] || [];
    const dataRows = rows.slice(headerIndex + 1).filter(r => r && r.length > 0);

    console.log(`Header row index: ${headerIndex}`);
    console.log(`Headers: ${headers.slice(0, 5).join(', ')}...`);
    console.log(`Data rows in file: ${dataRows.length}`);

    // Extract order IDs from the file
    const orderIdIndex = headers.findIndex((h: string) =>
        typeof h === 'string' && h.toLowerCase().includes('pedido')
    );

    console.log(`Order ID column index: ${orderIdIndex}`);

    // Count transaction types
    const typeIndex = headers.findIndex((h: string) =>
        typeof h === 'string' && (h.toLowerCase().includes('tipo') || h.toLowerCase().includes('type'))
    );

    const typeCounts: Record<string, number> = {};
    const allOrderIds: string[] = [];

    dataRows.forEach(row => {
        const type = row[typeIndex] || 'Unknown';
        typeCounts[type] = (typeCounts[type] || 0) + 1;

        if (orderIdIndex >= 0 && row[orderIdIndex]) {
            allOrderIds.push(String(row[orderIdIndex]));
        }
    });

    console.log('\nTransaction types in file:');
    Object.entries(typeCounts).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
    });

    // Check how many are already in database
    const uniqueOrderIds = [...new Set(allOrderIds)].filter(id => id && id !== 'undefined');
    console.log(`\nUnique order IDs in file: ${uniqueOrderIds.length}`);

    // Query existing payments
    const { data: existingPayments } = await supabase
        .from('marketplace_payments')
        .select('marketplace_order_id')
        .eq('marketplace', 'shopee')
        .in('marketplace_order_id', uniqueOrderIds.slice(0, 100)); // Sample first 100

    const existingIds = new Set(existingPayments?.map(p => p.marketplace_order_id) || []);
    console.log(`\nAlready in database (sample of 100): ${existingIds.size}`);

    // Count how many would be new
    const newIds = uniqueOrderIds.filter(id => !existingIds.has(id));
    console.log(`New entries to import: ${newIds.length} (from sample)`);

    // Show a few examples of new entries
    console.log('\nSample of entries in file:');
    dataRows.slice(0, 5).forEach((row, i) => {
        console.log(`  [${i + 1}] Type: ${row[typeIndex]}, Order: ${row[orderIdIndex]}`);
    });
}

analyzeImport().catch(console.error);
