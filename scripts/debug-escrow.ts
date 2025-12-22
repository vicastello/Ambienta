// Diagnóstico: buscar escrow detail raw para um pedido
const { getShopeeEscrowDetail } = require('../lib/shopeeClient');

// Configurar env
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.vercel');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach((line: string) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[match[1].trim()] = value;
    }
});

async function main() {
    const orderSn = '251211491BC33U';

    console.log('Buscando escrow detail para:', orderSn);
    console.log('='.repeat(60));

    try {
        const escrow = await getShopeeEscrowDetail(orderSn);
        console.log('\nResposta completa:');
        console.log(JSON.stringify(escrow, null, 2));
    } catch (err) {
        console.error('Erro:', err);
    }
}

main();
