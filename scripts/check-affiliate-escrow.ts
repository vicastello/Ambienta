import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
});

const supabase = createClient(
    envVars.NEXT_PUBLIC_SUPABASE_URL,
    envVars.SUPABASE_SERVICE_ROLE_KEY
);

const PARTNER_ID = parseInt(envVars.SHOPEE_PARTNER_ID || '0');
const PARTNER_KEY = envVars.SHOPEE_PARTNER_KEY || '';
const SHOP_ID = 428171387; // Correct shop_id from database
const BASE_URL = 'https://partner.shopeemobile.com';

async function getAccessToken(): Promise<string> {
    const { data } = await supabase
        .from('shopee_tokens')
        .select('access_token')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

    if (!data?.access_token) {
        throw new Error('No access token found in shopee_tokens');
    }

    return data.access_token;
}

function generateSign(path: string, timestamp: number, accessToken: string): string {
    const baseString = `${PARTNER_ID}${path}${timestamp}${accessToken}${SHOP_ID}`;
    return crypto.createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex');
}

async function callShopeeAPI(apiPath: string, params: Record<string, any> = {}): Promise<any> {
    const accessToken = await getAccessToken();
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = generateSign(apiPath, timestamp, accessToken);

    const queryParams = new URLSearchParams({
        partner_id: String(PARTNER_ID),
        shop_id: String(SHOP_ID),
        timestamp: String(timestamp),
        sign,
        access_token: accessToken,
        ...Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, String(v)])
        ),
    });

    const url = `${BASE_URL}${apiPath}?${queryParams.toString()}`;
    console.log('Calling:', url.replace(accessToken, 'HIDDEN').replace(sign, 'HIDDEN'));

    const response = await fetch(url);
    const data = await response.json();
    return data;
}

async function checkAffiliateEscrow() {
    const orderSn = '251206NBQVBF56';

    console.log('=== Checking Escrow Detail for Affiliate Order ===\n');
    console.log(`Order: ${orderSn}\n`);

    try {
        const data = await callShopeeAPI('/payment/get_escrow_detail', { order_sn: orderSn });

        console.log('=== FULL API RESPONSE ===');
        console.log(JSON.stringify(data, null, 2));

        if (data.response?.order_income) {
            console.log('\n=== ORDER INCOME FIELDS ===');
            console.log(JSON.stringify(data.response.order_income, null, 2));
        }

        if (data.response?.order_income?.items) {
            console.log('\n=== ITEM LEVEL BREAKDOWN ===');
            data.response.order_income.items.forEach((item: any, idx: number) => {
                console.log(`Item ${idx + 1}:`, JSON.stringify(item, null, 2));
            });
        }

        // Look for affiliate-related fields
        console.log('\n=== SEARCHING FOR AFFILIATE FIELDS ===');
        const affiliateTerms = ['affiliate', 'kol', 'influencer', 'referral', 'partner', 'mcf', 'creator'];

        function searchObject(obj: any, path = ''): void {
            if (!obj || typeof obj !== 'object') return;

            for (const key of Object.keys(obj)) {
                const currentPath = path ? `${path}.${key}` : key;
                const value = obj[key];

                const isRelevant = affiliateTerms.some(term =>
                    key.toLowerCase().includes(term) ||
                    (typeof value === 'string' && value.toLowerCase().includes(term))
                );

                if (isRelevant) {
                    console.log(`  Found: ${currentPath} =`, value);
                }

                if (value && typeof value === 'object') {
                    searchObject(value, currentPath);
                }
            }
        }

        searchObject(data);

    } catch (error) {
        console.error('Error:', error);
    }
}

checkAffiliateEscrow().catch(console.error);
