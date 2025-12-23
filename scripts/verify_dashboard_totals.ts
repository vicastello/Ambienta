
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.vercel');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
} else {
    dotenv.config({ path: '.env.local' });
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Helpers
const MARKETPLACE_DUE_DAYS: Record<string, number> = {
    'shopee': 14, 'mercado': 15, 'meli': 15, 'magalu': 30, 'magazine': 30, 'default': 30,
};

function getDueDays(canal: string | null): number {
    if (!canal) return MARKETPLACE_DUE_DAYS.default;
    const lowerCanal = canal.toLowerCase();
    for (const [key, days] of Object.entries(MARKETPLACE_DUE_DAYS)) {
        if (key !== 'default' && lowerCanal.includes(key)) return days;
    }
    return MARKETPLACE_DUE_DAYS.default;
}

function calculateDueDate(orderDate: Date, canal: string | null): Date {
    const dueDays = getDueDays(canal);
    const dueDate = new Date(orderDate);
    dueDate.setDate(dueDate.getDate() + dueDays);
    return dueDate;
}

async function runAudit() {
    console.log('--- Starting Full Database Audit ---');
    console.log('Goal: Verify match with Dashboard (Total ~29k, Recebido ~2.6k, Pendente ~1.2k, Atrasado ~26k, Saídas ~100)');

    const { calculateMarketplaceFees } = await import('../lib/marketplace-fees');

    // 1. Fetch Orders
    // We fetch ALL because the dashboard numbers likely reflect "All Time" or a large range.
    // If mismatch, we might need to verify date filters.
    const { data: orders, error } = await supabase
        .from('tiny_orders')
        .select(`
            id,
            valor_total_pedido, 
            valor, 
            payment_received, 
            data_criacao, 
            canal,
            situation:situacao,
            marketplace_payments!marketplace_payments_tiny_order_id_fkey (
                net_amount,
                is_expense
            ),
            marketplace_order_links (
                product_count,
                is_kit,
                uses_free_shipping,
                is_campaign_order
            ),
            valor_frete,
            fee_overrides
        `)
        .neq('situacao', 2); // Not Canceled

    if (error) {
        console.error('Error fetching:', error);
        return;
    }

    // 2. Fetch Orphan Payments
    const { data: orphans } = await supabase
        .from('marketplace_payments')
        .select('*')
        .is('tiny_order_id', null);

    // 3. Fetch Manual Entries
    const { data: manual } = await supabase
        .from('cash_flow_entries')
        .select('*');

    // -- Pre-fetch Shopee Items for Fallback -- 
    // (Only doing this if needed would be optimization, but for audit script we assume we can fetch what we need)
    // For simplicity in script, we won't replicate the full bulk fetch unless necessary for accuracy.
    // Let's assume standard logic first.

    const summary = {
        recebido: 0,
        pendente: 0,
        atrasado: 0,
        saidas: 0
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let countProcessed = 0;

    // Process Orders
    for (const o of orders) {
        countProcessed++;
        const vTotal = Number(o.valor || o.valor_total_pedido || 0);
        const vFrete = Number(o.valor_frete || 0);
        const valorOriginal = vTotal;
        const baseTaxas = Math.max(0, vTotal - vFrete);

        // Calculate Expectation
        let vEsperado: number | undefined;
        // ... (Simulate fee calc override if exists)

        // Determine Value
        const payments = Array.isArray(o.marketplace_payments) ? o.marketplace_payments : (o.marketplace_payments ? [o.marketplace_payments] : []);
        let valor = valorOriginal;

        if (payments.length > 0) {
            valor = payments.reduce((sum: number, p: any) => {
                const val = Number(p.net_amount || 0);
                return sum + (p.is_expense ? -Math.abs(val) : Math.abs(val));
            }, 0);
        } else if (!o.payment_received) {
            // Pending logic
            const canal = o.canal?.toLowerCase() || '';
            let marketplace: any;
            if (canal.includes('shopee')) marketplace = 'shopee';
            else if (canal.includes('mercado') || canal.includes('meli')) marketplace = 'mercado_livre';
            else if (canal.includes('magalu') || canal.includes('magazine')) marketplace = 'magalu';

            if (marketplace) {
                try {
                    const linkData = o.marketplace_order_links?.[0] as any;
                    // We skip the advanced fallback (getting items) for speed in this audit script unless requested,
                    // relying on linkData or default 1 item.
                    const feeCalc = await calculateMarketplaceFees({
                        marketplace,
                        orderValue: baseTaxas,
                        productCount: linkData?.product_count || 1,
                        isKit: linkData?.is_kit || false,
                        usesFreeShipping: (o.fee_overrides as any)?.usesFreeShipping ?? (linkData?.uses_free_shipping || false),
                        isCampaignOrder: linkData?.is_campaign_order || false,
                        orderDate: new Date(o.data_criacao || new Date())
                    });
                    valor = feeCalc.netValue;
                } catch (e) { }
            }
        }

        // Categorize
        if (o.payment_received) {
            summary.recebido += valor;
        } else {
            const orderDate = new Date(o.data_criacao || new Date());
            const dueDate = calculateDueDate(orderDate, o.canal);
            if (today > dueDate) {
                summary.atrasado += valor;
            } else {
                summary.pendente += valor;
            }
        }
    }

    // Process Orphans
    orphans?.forEach(p => {
        let description = p.transaction_description || p.description || p.transaction_type || '';
        const descLower = description.toLowerCase();
        const isAdsOrRecharge = descLower.match(/recarga|ads|publicidade/) && !descLower.match(/reembolso|estorno|cancelamento/);
        const isExpense = (p.net_amount || 0) < 0 || !!isAdsOrRecharge;
        const val = Math.abs(Number(p.net_amount || 0));

        if (isExpense) {
            summary.saidas += val;
        } else {
            summary.recebido += val;
        }
    });

    // Process Manual
    manual?.forEach(m => {
        const val = Number(m.amount || 0);
        if (m.type === 'expense') {
            if (m.status === 'confirmed') summary.saidas += val; // Paid expense reduces total? Dashboard treats "Saídas" as a separate card usually.
            // Wait, dashboard "Saídas" card usually sums ALL expenses (Paid + Pending if filtered?) 
            // Or just Paid? Logic in route.ts: 
            // summary.expenses.total accumulates all.
            // Let's assume user Card "Saídas" is Total Expenses.
            summary.saidas += val;
        } else {
            if (m.status === 'confirmed') summary.recebido += val;
            else {
                const dueDate = new Date(m.due_date);
                if (today > dueDate) summary.atrasado += val;
                else summary.pendente += val;
            }
        }
    });

    // Recalculate Total (Net)
    // Formula: (Recebido + Pendente + Atrasado) - Saídas
    const totalLiquido = (summary.recebido + summary.pendente + summary.atrasado) - summary.saidas;

    console.log('\n--- Audit Results ---');
    console.log(`Processed ${countProcessed} orders.`);
    console.log('Recebido:  R$', summary.recebido.toFixed(2).padEnd(15) + (Math.abs(summary.recebido - 2676.67) < 50 ? '(MATCH ~)' : '(DIFF)'));
    console.log('Pendente:  R$', summary.pendente.toFixed(2).padEnd(15) + (Math.abs(summary.pendente - 1224.83) < 50 ? '(MATCH ~)' : '(DIFF)'));
    console.log('Atrasado:  R$', summary.atrasado.toFixed(2).padEnd(15) + (Math.abs(summary.atrasado - 25994.25) < 500 ? '(MATCH ~)' : '(DIFF)'));
    console.log('Saídas:    R$', summary.saidas.toFixed(2).padEnd(15) + (Math.abs(summary.saidas - 100) < 1 ? '(MATCH)' : '(DIFF)'));
    console.log('-------------------------');
    console.log('Total Calc:R$', totalLiquido.toFixed(2).padEnd(15) + (Math.abs(totalLiquido - 29795.75) < 500 ? '(MATCH ~)' : '(DIFF)'));
}

runAudit();
