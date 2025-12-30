import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

async function testSync() {
    console.log('Testing fetchAndSaveTinyOrder...');

    // Dynamic import after dotenv
    const { fetchAndSaveTinyOrder } = await import('../lib/tinyClient');

    const orderId = '250405E509KAT0';
    const marketplace = 'shopee';

    console.log(`Attempting to sync order: ${orderId}`);

    try {
        const result = await fetchAndSaveTinyOrder(orderId, marketplace, true);
        console.log('Sync Result:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('Sync Error:', e);
    }
}

testSync();
