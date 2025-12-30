import * as XLSX from 'xlsx';

const filePath = '/Users/vitorcastello/Downloads/my_balance_transaction_report.shopee.20250401_20250430 (2).xlsx';

console.log('Reading file...');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

// Find the row that contains "Data" or "Tipo" which is likely the header
let headerRowIndex = -1;
for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.length > 0) {
        const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
        if (rowStr.includes('tipo de transação') || (rowStr.includes('data') && rowStr.includes('tipo'))) {
            headerRowIndex = i;
            console.log(`Found header at row ${i}:`);
            console.log(row.slice(0, 8).join(' | '));
            break;
        }
    }
}

if (headerRowIndex === -1) {
    console.log('Header not found. Showing rows 15-25:');
    for (let i = 15; i < Math.min(30, rows.length); i++) {
        const row = rows[i];
        if (row && row.length > 0) {
            const preview = row.slice(0, 6).map(c => String(c || '').substring(0, 25)).join(' | ');
            console.log(`[${i}] ${preview}`);
        }
    }
} else {
    // Show some data rows
    console.log('\nData rows:');
    for (let i = headerRowIndex + 1; i < Math.min(headerRowIndex + 10, rows.length); i++) {
        const row = rows[i];
        if (row && row.length > 0) {
            const preview = row.slice(0, 6).map(c => String(c || '').substring(0, 25)).join(' | ');
            console.log(`[${i}] ${preview}`);
        }
    }

    // Count total data rows
    const dataRows = rows.slice(headerRowIndex + 1).filter(r => r && r.length > 0 && r[0]);
    console.log(`\nTotal data rows: ${dataRows.length}`);
}
