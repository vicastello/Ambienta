import * as XLSX from 'xlsx';
import { resolve } from 'path';

const filePath = process.argv[2];
if (!filePath) {
    console.error('Por favor, forneça o caminho do arquivo XLSX');
    process.exit(1);
}

const absolutePath = resolve(process.cwd(), filePath);
console.log(`Lendo arquivo: ${absolutePath}`);

const workbook = XLSX.readFile(absolutePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Ler a primeira linha como cabeçalho
const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
if (jsonData.length > 0) {
    console.log('Colunas encontradas:');
    console.log(jsonData[0]);

    // Mostrar primeira linha de dados para exemplo
    if (jsonData.length > 1) {
        console.log('\nExemplo de dados (linha 1):');
        console.log(jsonData[1]);
    }
} else {
    console.log('Arquivo vazio ou inválido');
}
