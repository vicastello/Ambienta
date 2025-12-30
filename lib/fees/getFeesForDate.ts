/**
 * Busca as taxas vigentes para um marketplace em uma data específica.
 * Usado para calcular taxas baseadas na data de criação do pedido, não do extrato.
 */

import { createClient } from '@supabase/supabase-js';

export interface FeeConfig {
    commissionPercent: number;
    serviceFeePercent: number;
    paymentFeePercent: number;
    fixedFeePerOrder: number;
    fixedFeePerProduct: number;
    shippingFeePercent: number;
    adsFeePercent: number;
}

interface FeePeriodRow {
    id: number;
    marketplace: string;
    valid_from: string;
    valid_to: string | null;
    commission_percent: number;
    service_fee_percent: number;
    payment_fee_percent: number;
    fixed_fee_per_order: number;
    fixed_fee_per_product: number;
    shipping_fee_percent: number;
    ads_fee_percent: number;
    notes: string | null;
}

const DEFAULT_FEES: Record<string, FeeConfig> = {
    shopee: {
        commissionPercent: 20,
        serviceFeePercent: 2,
        paymentFeePercent: 0,
        fixedFeePerOrder: 0,
        fixedFeePerProduct: 4,
        shippingFeePercent: 0,
        adsFeePercent: 0,
    },
    magalu: {
        commissionPercent: 16,
        serviceFeePercent: 0,
        paymentFeePercent: 0,
        fixedFeePerOrder: 0,
        fixedFeePerProduct: 0,
        shippingFeePercent: 0,
        adsFeePercent: 0,
    },
    mercado_livre: {
        commissionPercent: 17,
        serviceFeePercent: 0,
        paymentFeePercent: 0,
        fixedFeePerOrder: 0,
        fixedFeePerProduct: 0,
        shippingFeePercent: 0,
        adsFeePercent: 0,
    },
};

/**
 * Busca as taxas vigentes para um marketplace em uma data específica
 * @param supabase - Cliente Supabase
 * @param marketplace - Nome do marketplace ('shopee', 'magalu', 'mercado_livre')
 * @param orderDate - Data do pedido para buscar taxas vigentes
 * @returns Configuração de taxas vigentes na data
 */
export async function getFeesForDate(
    supabase: ReturnType<typeof createClient>,
    marketplace: string,
    orderDate: Date
): Promise<FeeConfig> {
    const dateStr = orderDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const { data, error } = await supabase
        .from('marketplace_fee_periods')
        .select('*')
        .eq('marketplace', marketplace)
        .lte('valid_from', dateStr)
        .or(`valid_to.gte.${dateStr},valid_to.is.null`)
        .order('valid_from', { ascending: false })
        .limit(1)
        .maybeSingle() as { data: FeePeriodRow | null; error: any };

    if (error) {
        console.error('[getFeesForDate] Erro ao buscar taxas:', error.message);
        return getDefaultFees(marketplace);
    }

    if (data) {
        return {
            commissionPercent: Number(data.commission_percent) || 0,
            serviceFeePercent: Number(data.service_fee_percent) || 0,
            paymentFeePercent: Number(data.payment_fee_percent) || 0,
            fixedFeePerOrder: Number(data.fixed_fee_per_order) || 0,
            fixedFeePerProduct: Number(data.fixed_fee_per_product) || 0,
            shippingFeePercent: Number(data.shipping_fee_percent) || 0,
            adsFeePercent: Number(data.ads_fee_percent) || 0,
        };
    }

    // Fallback para valores padrão se não encontrar período
    return getDefaultFees(marketplace);
}

/**
 * Retorna taxas padrão para um marketplace
 */
export function getDefaultFees(marketplace: string): FeeConfig {
    return DEFAULT_FEES[marketplace] || DEFAULT_FEES.shopee;
}

/**
 * Calcula o valor esperado das taxas com base na configuração
 */
export function calculateExpectedFees(
    orderValue: number,
    productCount: number,
    fees: FeeConfig
): number {
    const commissionFee = orderValue * (fees.commissionPercent / 100);
    const serviceFee = orderValue * (fees.serviceFeePercent / 100);
    const paymentFee = orderValue * (fees.paymentFeePercent / 100);
    const fixedOrderFee = fees.fixedFeePerOrder;
    const fixedProductFee = fees.fixedFeePerProduct * productCount;

    return commissionFee + serviceFee + paymentFee + fixedOrderFee + fixedProductFee;
}
