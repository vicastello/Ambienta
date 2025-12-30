import * as fs from 'fs';

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

const filePath = '/Users/vitorcastello/projetos/gestor-tiny/Historico/importados/pedidos_venda_1-500.csv';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

const header = parseCSVLine(lines[0]);
console.log('Headers:');
header.forEach((h, i) => {
    console.log(`  [${i}] ${h}`);
});

console.log('\n\nFirst 3 data rows:');
for (let i = 1; i <= 3; i++) {
    const values = parseCSVLine(lines[i]);
    console.log(`\nRow ${i}:`);
    console.log(`  ID (0): ${values[0]}`);
    console.log(`  Número do pedido (1): ${values[1]}`);
    console.log(`  Número da ordem de compra (29): ${values[29]}`);
    console.log(`  Total columns: ${values.length}`);
}
