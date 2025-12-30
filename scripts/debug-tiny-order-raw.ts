import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

// import { getTinyToken } from '../lib/tinyAuth';

async function fetchTinyOrderRaw(id: string) {
    const { getAccessTokenFromDbOrRefresh } = await import('../lib/tinyAuth');
    const token = await getAccessTokenFromDbOrRefresh();

    // Fetch details
    const detailUrl = `https://api.tiny.com.br/api2/pedido.obter.php?token=${token}&id=${id}&formato=json`;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();

    console.log('--- RAW ORDER DATA ---');
    console.log(JSON.stringify(detailData, null, 2));
}

// Order tiny_id 907887223
fetchTinyOrderRaw('907887223').catch(console.error);
