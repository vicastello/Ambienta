
import { createReadStream, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { parse } from 'csv-parse';

const dir = resolve(process.cwd(), 'historico/importados');
const targetOrder = '2820'; // Order ID from Jan 1st

async function findOrder() {
    // Check ALL csv files
    const files = readdirSync(dir).filter(f => f.endsWith('.csv'));
    console.log(`Scanning ${files.length} CSV files...`);

    for (const file of files) {
        const filePath = join(dir, file);
        let firstDate = null;

        await new Promise<void>((resolvePromise) => {
            const parser = createReadStream(filePath).pipe(parse({
                columns: true,
                relax_quotes: true,
                bom: true,
                to: 100 // Read only first 100 lines for speed if looking for date
            }));

            parser.on('data', (row: any) => {
                if (!firstDate && row['Data']) firstDate = row['Data'];

                // Check if any value in the row contains the target IDs
                const values = Object.values(row).join(' ');
                if (values.includes('250101BS1CBEE1') || row['Número do pedido'] === '2820') {
                    console.log(`\n✅ ENCONTRADO no arquivo: ${file}`);
                    console.log(`   Número do pedido: ${row['Número do pedido']}`);
                    console.log(`   Data: ${row['Data']}`);
                    console.log(`   Número da ordem de compra: ${row['Número da ordem de compra']}`);
                    // console.log(`   Obs: ${row['Observações']}`); // Removed this line
                    // console.log(row);
                    process.exit(0);
                }
            });

            parser.on('end', () => {
                console.log(`File: ${file.padEnd(35)} | Start Date: ${firstDate}`);
                resolvePromise();
            });
            parser.on('error', () => resolvePromise());
        });
    }
    console.log('Not found in any CSV');
}

findOrder();
