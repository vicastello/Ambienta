import { createClient } from '@supabase/supabase-js';
import { SHOPEE_DEFAULTS } from '@/app/configuracoes/taxas-marketplace/lib/defaults';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

export async function calculateMarketplaceFees(
    input: FeeCalculationInput
): Promise<FeeCalculationResult> {
    const config = await getMarketplaceFeeConfig(input.marketplace);

    switch (input.marketplace) {
        case 'shopee':
            return calculateShopeeFees(input, config);
        case 'mercado_livre':
            return calculateMercadoLivreFees(input, config);
        case 'magalu':
            return calculateMagaluFees(input, config);
        default:
            throw new Error(`Unknown marketplace: ${input.marketplace}`);
    }
}

function calculateShopeeFees(
    input: FeeCalculationInput,
    config: any
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

    const commissionRate = usesFreeShipping
        ? safeConfig.free_shipping_commission
        : safeConfig.base_commission;

    // Calculate commission on value AFTER voucher deduction
    const commissionFee = (valueAfterVoucher * commissionRate) / 100;

    // Campaign fee - ALWAYS applied
    // Default rate (2.5%) applies always
    // During Nov/Dec period, rate increases to 3.5%
    let campaignRate = safeConfig.campaign_fee_default; // Always start with default (2.5%)

    if (input.orderDate) {
        // Check custom campaigns first (highest priority)
        if (safeConfig.campaigns && safeConfig.campaigns.length > 0) {
            const matchingCampaign = safeConfig.campaigns.find((campaign: any) => {
                if (!campaign.is_active) return false;
                const startDate = new Date(campaign.start_date);
                const endDate = new Date(campaign.end_date);
                return input.orderDate! >= startDate && input.orderDate! <= endDate;
            });

            if (matchingCampaign) {
                campaignRate = matchingCampaign.fee_rate;
            }
        }

        // Check Nov/Dec period (if no custom campaign matched)
        if (safeConfig.campaign_start_date && safeConfig.campaign_end_date) {
            const startDate = new Date(safeConfig.campaign_start_date);
            const endDate = new Date(safeConfig.campaign_end_date);
            const isInNovDecPeriod = input.orderDate >= startDate && input.orderDate <= endDate;

            if (isInNovDecPeriod) {
                // Nov/Dec rate overrides default (but custom campaigns take precedence)
                const hasCustomCampaign = safeConfig.campaigns?.some((c: any) => {
                    if (!c.is_active) return false;
                    const cStart = new Date(c.start_date);
                    const cEnd = new Date(c.end_date);
                    return input.orderDate! >= cStart && input.orderDate! <= cEnd;
                });

                if (!hasCustomCampaign) {
                    campaignRate = safeConfig.campaign_fee_nov_dec;
                }
            }
        }
    }

    // Calculate campaign fee on value AFTER voucher deduction
    const campaignFee = (valueAfterVoucher * campaignRate) / 100;

    // Fixed cost: R$ 4 per product, but if it's a kit, only count once
    const units = input.isKit ? 1 : (input.productCount || 1);
    const fixedCost = safeConfig.fixed_cost_per_product * units;

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
    config: any
): FeeCalculationResult {
    const grossValue = input.orderValue;

    // Commission
    const commissionRate = config.premium_commission;
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
    config: any
): FeeCalculationResult {
    const grossValue = input.orderValue;
    const productCount = input.productCount || 1;

    // Config field names: commission_rate (decimal, e.g. 0.148) and fixed_cost_per_product
    let commissionRate = config.commission_rate ?? config.commission ?? 0.148;

    // If rate is in decimal form (e.g., 0.148), convert to percentage for calculation
    // Commission is expected as percentage (e.g., 14.8), so divide by 100 if < 1
    if (commissionRate < 1) {
        commissionRate = commissionRate * 100; // Convert 0.148 -> 14.8
    }

    const commissionFee = (grossValue * commissionRate) / 100;
    const fixedCostPerUnit = config.fixed_cost_per_product ?? config.fixed_cost ?? 5;
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
