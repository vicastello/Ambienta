import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

async function syncOrder() {
    const { fetchAndSaveTinyOrder } = await import('../lib/tinyClient');

    const orderId = '250422V25FEPW7';

    console.log(`Attempting to sync order ${orderId} from Tiny API...`);

    try {
        const result = await fetchAndSaveTinyOrder(orderId, 'shopee');
        console.log('Result:', JSON.stringify(result, null, 2));

        if (result.success) {
            console.log(`\n✅ Order synced! Tiny ID: ${result.tinyOrderId}`);
        } else {
            console.log(`\n❌ Sync failed: ${result.error}`);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

syncOrder();
