import { createClient } from '@supabase/supabase-js';
import { SHOPEE_DEFAULTS } from '@/app/configuracoes/taxas-marketplace/lib/defaults';
import { normalizeEnvValue } from '@/lib/env';

const supabaseUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey =
    normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const supabase = createClient(supabaseUrl, supabaseKey);

export interface FeeCalculationInput {
    marketplace: 'shopee' | 'mercado_livre' | 'magalu';
    orderValue: number;
    productCount?: number;
    isKit?: boolean;
    usesFreeShipping?: boolean;
    isCampaignOrder?: boolean;
    orderDate?: Date;
    /** Seller voucher/coupon amount (deducted from seller, not buyer) */
    sellerVoucher?: number;
    /** Affiliate Marketing Solutions commission (Shopee affiliate/influencer sales) */
    amsCommissionFee?: number;
}

export interface FeeCalculationResult {
    grossValue: number;
    commissionFee: number;
    campaignFee?: number;
    fixedCost: number;
    sellerVoucher?: number;
    amsCommissionFee?: number;
    totalFees: number;
    netValue: number;
    breakdown: {
        commissionRate: number;
        campaignRate?: number;
        fixedCostPerUnit: number;
        units: number;
        transactionFee?: number;
        sellerVoucher?: number;
        amsCommissionFee?: number;
    };
}

interface MarketplaceFeeConfig {
    marketplace: string;
    config: any;
}

// Cache for configs to avoid repeated DB calls
const configCache = new Map<string, { config: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getMarketplaceFeeConfig(marketplace: string): Promise<any> {
    // Check cache
    const cached = configCache.get(marketplace);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.config;
    }

    // Fetch from DB
    const { data, error } = await supabase
        .from('marketplace_fee_config')
        .select('config')
        .eq('marketplace', marketplace)
        .single();

    if (error || !data) {
        console.error(`[marketplace-fees] Failed to load config for ${marketplace}:`, error);
        throw new Error(`Fee config not found for marketplace: ${marketplace}`);
    }

    // Update cache
    configCache.set(marketplace, { config: data.config, timestamp: Date.now() });
    return data.config;
}

/**
 * Busca taxas históricas do período específico na tabela marketplace_fee_periods
 * Uses caching to avoid N+1 queries when processing multiple payments
 */
// Cache for historical fees to avoid repeated DB calls
const historicalFeesCache = new Map<string, { fees: any; timestamp: number }>();
const HISTORICAL_FEES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getHistoricalFees(marketplace: string, orderDate: Date): Promise<{
    commissionPercent?: number;
    serviceFeePercent?: number;
    fixedFeePerProduct?: number;
} | null> {
    const dateStr = orderDate.toISOString().split('T')[0];
    const cacheKey = `${marketplace}:${dateStr}`;

    // Check cache first
    const cached = historicalFeesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HISTORICAL_FEES_CACHE_TTL) {
        return cached.fees;
    }

    const { data, error } = await supabase
        .from('marketplace_fee_periods')
        .select('commission_percent, service_fee_percent, fixed_fee_per_product')
        .eq('marketplace', marketplace)
        .lte('valid_from', dateStr)
        .or(`valid_to.gte.${dateStr},valid_to.is.null`)
        .order('valid_from', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !data) {
        // Cache null result to avoid repeated queries
        historicalFeesCache.set(cacheKey, { fees: null, timestamp: Date.now() });
        return null; // Fallback to default config
    }

    const fees = {
        commissionPercent: data.commission_percent,
        serviceFeePercent: data.service_fee_percent,
        fixedFeePerProduct: data.fixed_fee_per_product,
    };

    // Cache the result
    historicalFeesCache.set(cacheKey, { fees, timestamp: Date.now() });
    return fees;
}

export async function calculateMarketplaceFees(
    input: FeeCalculationInput
): Promise<FeeCalculationResult> {
    const config = await getMarketplaceFeeConfig(input.marketplace);

    // If orderDate is provided, check for historical fee periods (cached)
    let historicalFees: { commissionPercent?: number; serviceFeePercent?: number; fixedFeePerProduct?: number } | null = null;
    if (input.orderDate) {
        historicalFees = await getHistoricalFees(input.marketplace, input.orderDate);
    }

    switch (input.marketplace) {
        case 'shopee':
            return calculateShopeeFees(input, config, historicalFees);
        case 'mercado_livre':
            return calculateMercadoLivreFees(input, config, historicalFees);
        case 'magalu':
            return calculateMagaluFees(input, config, historicalFees);
        default:
            throw new Error(`Unknown marketplace: ${input.marketplace}`);
    }
}

function calculateShopeeFees(
    input: FeeCalculationInput,
    config: any,
    historicalFees?: { commissionPercent?: number; serviceFeePercent?: number; fixedFeePerProduct?: number } | null
): FeeCalculationResult {
    const grossValue = input.orderValue;

    // Ensure we use defaults if config fields are missing
    const safeConfig = { ...SHOPEE_DEFAULTS, ...config };

    // Seller voucher: deducted BEFORE calculating percentage-based fees
    // Shopee calculates commission/campaign on the value AFTER the voucher is deducted
    const sellerVoucher = input.sellerVoucher || 0;
    const valueAfterVoucher = grossValue - sellerVoucher;

    const usesFreeShipping = input.usesFreeShipping !== undefined
        ? input.usesFreeShipping
        : (safeConfig.participates_in_free_shipping || false);

    // Use historical fees if available, otherwise use config
    let commissionRate: number;
    let fixedCostPerProduct: number;

    if (historicalFees && historicalFees.commissionPercent !== undefined) {
        // Historical period found - use those rates
        commissionRate = historicalFees.commissionPercent;
        fixedCostPerProduct = historicalFees.fixedFeePerProduct ?? safeConfig.fixed_cost_per_product;
    } else {
        // Use config rates
        commissionRate = usesFreeShipping
            ? safeConfig.free_shipping_commission
            : safeConfig.base_commission;
        fixedCostPerProduct = safeConfig.fixed_cost_per_product;
    }

    // Calculate commission on value AFTER voucher deduction
    const commissionFee = (valueAfterVoucher * commissionRate) / 100;

    // Campaign/Service fee - use historical rate if available, otherwise config default
    // All historical period rates are now managed via marketplace_fee_periods table
    const campaignRate = historicalFees?.serviceFeePercent ?? safeConfig.campaign_fee_default ?? 0;

    // Calculate campaign fee on value AFTER voucher deduction
    const campaignFee = (valueAfterVoucher * campaignRate) / 100;

    // Fixed cost: R$ 4 per product, but if it's a kit, only count once
    const units = input.isKit ? 1 : (input.productCount || 1);
    const fixedCost = fixedCostPerProduct * units;

    // Affiliate commission (AMS) - passed from Shopee escrow data, not calculated
    const amsCommissionFee = input.amsCommissionFee || 0;

    // Total percentage-based fees (on value after voucher)
    const percentageFees = commissionFee + campaignFee;

    // Net Value = valueAfterVoucher - percentageFees - fixedCost - amsCommissionFee
    const netValue = valueAfterVoucher - percentageFees - fixedCost - amsCommissionFee;

    // Total fees for display (includes everything deducted from original value)
    const totalFees = sellerVoucher + percentageFees + fixedCost + amsCommissionFee;

    return {
        grossValue,
        commissionFee,
        campaignFee,
        fixedCost,
        sellerVoucher: sellerVoucher > 0 ? sellerVoucher : undefined,
        amsCommissionFee: amsCommissionFee > 0 ? amsCommissionFee : undefined,
        totalFees,
        netValue,
        breakdown: {
            commissionRate,
            campaignRate,
            fixedCostPerUnit: safeConfig.fixed_cost_per_product,
            units,
            sellerVoucher: sellerVoucher > 0 ? sellerVoucher : undefined,
            amsCommissionFee: amsCommissionFee > 0 ? amsCommissionFee : undefined,
        },
    };
}

function calculateMercadoLivreFees(
    input: FeeCalculationInput,
    config: any,
    historicalFees?: { commissionPercent?: number; serviceFeePercent?: number; fixedFeePerProduct?: number } | null
): FeeCalculationResult {
    const grossValue = input.orderValue;

    // Commission - use historical rate if available
    const commissionRate = historicalFees?.commissionPercent ?? config.premium_commission;
    const commissionFee = (grossValue * commissionRate) / 100;

    // Fixed cost based on tiers
    let fixedCost = 0;
    for (const tier of config.fixed_cost_tiers) {
        const minOk = !tier.min || grossValue >= tier.min;
        const maxOk = !tier.max || grossValue < tier.max;
        if (minOk && maxOk) {
            fixedCost = tier.cost;
            break;
        }
    }

    // Special case: products under R$ 12.50 pay half
    if (grossValue < 12.50) {
        fixedCost = fixedCost / 2;
    }

    const totalFees = commissionFee + fixedCost;
    const netValue = grossValue - totalFees;

    return {
        grossValue,
        commissionFee,
        fixedCost,
        totalFees,
        netValue,
        breakdown: {
            commissionRate,
            fixedCostPerUnit: fixedCost,
            units: 1,
        },
    };
}

function calculateMagaluFees(
    input: FeeCalculationInput,
    config: any,
    historicalFees?: { commissionPercent?: number; serviceFeePercent?: number; fixedFeePerProduct?: number } | null
): FeeCalculationResult {
    const grossValue = input.orderValue;
    const productCount = input.productCount || 1;

    // Use historical rate if available, otherwise use config
    let commissionRate: number;
    let fixedCostPerUnit: number;

    if (historicalFees && historicalFees.commissionPercent !== undefined) {
        // Historical period found - use those rates
        commissionRate = historicalFees.commissionPercent;
        fixedCostPerUnit = historicalFees.fixedFeePerProduct ?? config.fixed_cost_per_product ?? 5;
    } else {
        // Config field names: commission_rate (decimal, e.g. 0.148) and fixed_cost_per_product
        commissionRate = config.commission_rate ?? config.commission ?? 0.148;

        // If rate is in decimal form (e.g., 0.148), convert to percentage for calculation
        if (commissionRate < 1) {
            commissionRate = commissionRate * 100; // Convert 0.148 -> 14.8
        }
        fixedCostPerUnit = config.fixed_cost_per_product ?? config.fixed_cost ?? 5;
    }

    const commissionFee = (grossValue * commissionRate) / 100;
    const fixedCost = fixedCostPerUnit * productCount;

    const totalFees = commissionFee + fixedCost;
    const netValue = grossValue - totalFees;

    return {
        grossValue,
        commissionFee,
        fixedCost,
        totalFees,
        netValue,
        breakdown: {
            commissionRate,
            fixedCostPerUnit,
            units: productCount,
        },
    };
}

// Helper to clear cache (useful for testing or when config is updated)
export function clearFeeConfigCache(marketplace?: string) {
    if (marketplace) {
        configCache.delete(marketplace);
    } else {
        configCache.clear();
    }
}
