import { createClient } from '@supabase/supabase-js';

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
}

export interface FeeCalculationResult {
    grossValue: number;
    commissionFee: number;
    campaignFee?: number;
    fixedCost: number;
    totalFees: number;
    netValue: number;
    breakdown: {
        commissionRate: number;
        campaignRate?: number;
        fixedCostPerUnit: number;
        units: number;
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

    // Commission rate: prioritize manual override, otherwise use global config
    const usesFreeShipping = input.usesFreeShipping !== undefined
        ? input.usesFreeShipping
        : (config.participates_in_free_shipping || false);

    const commissionRate = usesFreeShipping
        ? config.free_shipping_commission
        : config.base_commission;

    const commissionFee = (grossValue * commissionRate) / 100;

    // Campaign fee - check all active campaigns
    let campaignFee = 0;
    let campaignRate = 0;
    if (input.isCampaignOrder && input.orderDate) {
        // NEW: Check campaigns array first (if it exists)
        if (config.campaigns && config.campaigns.length > 0) {
            // Find matching active campaign
            const matchingCampaign = config.campaigns.find((campaign: any) => {
                if (!campaign.is_active) return false;
                const startDate = new Date(campaign.start_date);
                const endDate = new Date(campaign.end_date);
                return input.orderDate! >= startDate && input.orderDate! <= endDate;
            });

            if (matchingCampaign) {
                campaignRate = matchingCampaign.fee_rate;
                campaignFee = (grossValue * campaignRate) / 100;
            } else {
                // No matching campaign, use default
                campaignRate = config.campaign_fee_default;
                campaignFee = (grossValue * campaignRate) / 100;
            }
        } else {
            // FALLBACK: Use legacy single campaign logic for backwards compatibility
            let isNovDecPeriod = false;

            // Use exact date range from config if available
            if (config.campaign_start_date && config.campaign_end_date) {
                const startDate = new Date(config.campaign_start_date);
                const endDate = new Date(config.campaign_end_date);
                isNovDecPeriod = input.orderDate >= startDate && input.orderDate <= endDate;
            } else {
                // Fallback to month-based logic if dates are missing
                const orderMonth = input.orderDate.getMonth();
                isNovDecPeriod = (orderMonth === 10 || orderMonth === 11);
            }

            campaignRate = isNovDecPeriod
                ? config.campaign_fee_nov_dec
                : config.campaign_fee_default;
            campaignFee = (grossValue * campaignRate) / 100;
        }
    }

    // Fixed cost: R$ 4 per product, but if it's a kit, only count once
    const units = input.isKit ? 1 : (input.productCount || 1);
    const fixedCost = config.fixed_cost_per_product * units;

    const totalFees = commissionFee + campaignFee + fixedCost;
    const netValue = grossValue - totalFees;

    return {
        grossValue,
        commissionFee,
        campaignFee,
        fixedCost,
        totalFees,
        netValue,
        breakdown: {
            commissionRate,
            campaignRate,
            fixedCostPerUnit: config.fixed_cost_per_product,
            units,
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

    const commissionRate = config.commission;
    const commissionFee = (grossValue * commissionRate) / 100;
    const fixedCost = config.fixed_cost;

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

// Helper to clear cache (useful for testing or when config is updated)
export function clearFeeConfigCache(marketplace?: string) {
    if (marketplace) {
        configCache.delete(marketplace);
    } else {
        configCache.clear();
    }
}
