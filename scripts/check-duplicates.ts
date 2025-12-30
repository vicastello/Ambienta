import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkDuplicates() {
    const filePath = '/Users/vitorcastello/Downloads/my_balance_transaction_report.shopee.20250401_20250430 (2).xlsx';

    console.log('Reading file...');
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    // Header is at row 17 (0-indexed)
    const headers = rows[17];
    const orderIdIndex = 3; // ID do pedido column

    // Get all order IDs from file
    const dataRows = rows.slice(18);
    const allOrderIds = dataRows
        .filter(r => r && r.length > 3 && r[orderIdIndex])
        .map(r => String(r[orderIdIndex]));

    console.log(`Total order IDs in file: ${allOrderIds.length}`);

    // Check database for existing entries (in batches)
    const batchSize = 500;
    let existingCount = 0;

    for (let i = 0; i < allOrderIds.length; i += batchSize) {
        const batch = allOrderIds.slice(i, i + batchSize);
        const { data, count } = await supabase
            .from('marketplace_payments')
            .select('marketplace_order_id', { count: 'exact' })
            .eq('marketplace', 'shopee')
            .in('marketplace_order_id', batch);

        existingCount += (count || 0);
    }

    console.log(`Already in database: ${existingCount}`);
    console.log(`New entries to import: ${allOrderIds.length - existingCount}`);

    // Count by transaction type
    const typeCounts: Record<string, number> = {};
    dataRows.forEach(row => {
        if (row && row.length > 1) {
            const type = row[1] || 'Unknown';
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        }
    });

    console.log('\nTransaction types in file:');
    Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });
}

checkDuplicates().catch(console.error);
