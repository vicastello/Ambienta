import * as XLSX from 'xlsx';

const filePath = '/Users/vitorcastello/projetos/gestor-tiny/Historico/importados/Order.all.order_creation_date.20250201_20250228.xlsx';

console.log('Reading XLSX file...');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

console.log(`Total rows: ${rows.length}`);
console.log('\nHeaders:');
const header = rows[0];
header.forEach((h: any, i: number) => {
    console.log(`  [${i}] ${h}`);
});

console.log('\n\nFirst 3 data rows (columns with IDs):');
for (let i = 1; i <= 3 && i < rows.length; i++) {
    const row = rows[i];
    console.log(`\nRow ${i}:`);
    header.forEach((h: any, j: number) => {
        const val = row[j];
        if (h && String(h).toLowerCase().includes('id') ||
            h && String(h).toLowerCase().includes('ordem') ||
            h && String(h).toLowerCase().includes('order')) {
            console.log(`  [${j}] ${h}: ${val}`);
        }
    });
}
