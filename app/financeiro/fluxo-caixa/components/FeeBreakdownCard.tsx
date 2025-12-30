'use client';

import { cn } from '@/lib/utils';

interface FeeBreakdownCardProps {
    breakdown: {
        // Core calculation fields
        grossValue: number;
        commissionFee: number;
        campaignFee?: number;
        fixedCost: number;
        sellerVoucher?: number;
        amsCommissionFee?: number;
        totalFees: number;
        netValue: number;
        productCount?: number;
        refundAmount?: number;
        refundOriginalValue?: number;
        // Breakdown details
        breakdown?: {
            commissionRate: number;
            campaignRate?: number;
            fixedCostPerUnit: number;
            units: number;
        };
        // Shopee-specific data
        shopeeData?: {
            orderSellingPrice: number;
            orderDiscountedPrice: number; // Base value for fee calculation
            sellerDiscount: number;
            escrowAmount: number;
            voucherFromSeller: number;
            voucherFromShopee: number;
            amsCommissionFee: number;
            isLeveMaisPagueMenos: boolean; // True if seller_discount is small (<=5%)
            // Refund information
            refundAmount: number;
            originalProductCount: number;
            originalOrderValue: number | null;
            escrowDifference: number;
        };
    };
    marketplace: string;
    isEditing?: boolean;
    overrides?: {
        commissionFee?: number;
        fixedCost?: number;
        campaignFee?: number;
        shippingFee?: number;
        otherFees?: number;
        notes?: string;
        usesFreeShipping?: boolean;
    };
    onOverrideChange?: (field: string, value: number) => void;
    onSave?: () => void;
    onToggleEdit?: () => void;
    // Payment breakdown for Extrato Financeiro
    paymentsBreakdown?: {
        net_amount: number;
        is_expense: boolean;
        transaction_type?: string;
        payment_date?: string;
    }[];
    // Order valor for showing Saldo Final
    valorFinal?: number;
}

const formatBRL = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

// Row component for consistent styling matching Dashboard (Minimalist)
const FeeRow = ({
    label,
    value,
    isNegative = true,
    isTotal = false,
    isSubtotal = false,
    color = 'default',
    subLabel,
}: {
    label: string;
    value: number;
    isNegative?: boolean;
    isTotal?: boolean;
    isSubtotal?: boolean;
    color?: 'default' | 'green' | 'red' | 'orange' | 'purple' | 'blue' | 'gray';
    subLabel?: string;
}) => {
    // Mapping colors to app theme vars or classes
    const colorClasses = {
        default: 'text-main',
        green: 'text-emerald-500 dark:text-emerald-400',
        red: 'text-rose-500 dark:text-rose-400',
        orange: 'text-amber-500 dark:text-amber-400',
        purple: 'text-purple-500 dark:text-purple-400',
        blue: 'text-blue-500 dark:text-blue-400',
        gray: 'text-muted',
    };

    return (
        <div className={cn(
            'flex justify-between items-center py-2 px-2 hover:bg-white/5 rounded-lg transition-colors border-b border-dashed border-white/5 last:border-0',
            isTotal ? 'border-t border-solid border-white/10 pt-3 mt-1' : ''
        )}>
            <div className="flex flex-col">
                <span className={cn(
                    'text-sm',
                    isTotal ? 'text-main font-semibold' : 'text-main/80'
                )}>
                    {label}
                </span>
                {subLabel && (
                    <span className="text-[11px] text-muted">{subLabel}</span>
                )}
            </div>
            <span className={cn(
                'text-sm font-medium',
                isTotal ? 'text-base font-bold' : '',
                colorClasses[color]
            )}>
                {isNegative && value > 0 ? '-' : ''}{formatBRL(Math.abs(value))}
            </span>
        </div>
    );
};

// Section header
const SectionHeader = ({ title, icon }: { title: string; icon?: string }) => (
    <div className="flex items-center gap-2 mb-2 px-2 pt-2">
        <h5 className="text-[10px] font-bold uppercase tracking-widest text-muted/80">
            {icon} {title}
        </h5>
    </div>
);

// Format BRL for Extrato
const formatBRLSimple = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

export default function FeeBreakdownCard({
    breakdown,
    marketplace,
    isEditing = false,
    overrides = {},
    onOverrideChange,
    onSave,
    onToggleEdit,
    paymentsBreakdown,
    valorFinal,
}: FeeBreakdownCardProps) {
    const shopeeData = breakdown.shopeeData;
    const isShopee = marketplace === 'shopee' && shopeeData;
    const genericRefundAmount = !isShopee ? (breakdown.refundAmount || 0) : 0;
    const genericOriginalValue = breakdown.refundOriginalValue ?? (
        genericRefundAmount > 0 ? breakdown.grossValue + genericRefundAmount : breakdown.grossValue
    );

    // Format date helper
    const formatDate = (dateStr: string | undefined) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString('pt-BR');
        } catch {
            return dateStr;
        }
    };

    // Calculate values using overrides when available
    const effectiveCommissionFee = overrides.commissionFee ?? breakdown.commissionFee;
    const effectiveFixedCost = overrides.fixedCost ?? breakdown.fixedCost;
    const effectiveCampaignFee = overrides.campaignFee ?? (breakdown.campaignFee || 0);

    // Get effective rates from overrides or breakdown
    const effectiveCommissionRate = (overrides as any).commissionRate ?? breakdown.breakdown?.commissionRate ?? 0;
    const effectiveCampaignRate = (overrides as any).campaignRate ?? breakdown.breakdown?.campaignRate ?? 0;
    const effectiveFixedCostPerUnit = (overrides as any).fixedCostPerProduct ?? breakdown.breakdown?.fixedCostPerUnit ?? 0;
    const effectiveUnits = breakdown.productCount ?? breakdown.breakdown?.units ?? 1;

    // Calculate subtotals with override values
    const subtotalMarketplaceFees = effectiveCommissionFee + effectiveFixedCost + effectiveCampaignFee;
    const subtotalSellerCosts = (breakdown.sellerVoucher || 0) + (breakdown.amsCommissionFee || 0);

    // Calculate total deductions and net value with overrides
    const totalDeductions = subtotalMarketplaceFees + subtotalSellerCosts;
    const netValueCalculated = breakdown.grossValue - totalDeductions;

    // Check if we have any overrides applied
    const hasOverrides = overrides.commissionFee !== undefined ||
        overrides.fixedCost !== undefined ||
        overrides.campaignFee !== undefined ||
        (overrides as any).commissionRate !== undefined;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <h4 className="text-lg font-semibold text-main flex items-center gap-2">
                    📊 Detalhamento Financeiro
                </h4>
                {onToggleEdit && (
                    <button
                        onClick={onToggleEdit}
                        className="text-xs app-btn-secondary px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors text-main border border-white/10"
                    >
                        {isEditing ? 'Cancelar' : 'Ajustar'}
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column: Calculation */}
                <div className="space-y-6">
                    {/* Base Value Section */}
                    <div>
                        <SectionHeader title="Valor Base" icon="💰" />
                        <div className="bg-white/5 rounded-2xl p-2 border border-white/5">
                            {/* Show refund information if there was a return */}
                            {isShopee && shopeeData.refundAmount > 0 ? (
                                <>
                                    <FeeRow
                                        label="Valor Total Produtos"
                                        value={shopeeData.originalOrderValue || 0}
                                        isNegative={false}
                                        color="default"
                                    />
                                    <FeeRow
                                        label="Reembolso"
                                        value={shopeeData.refundAmount}
                                        color="orange"
                                    />
                                    <FeeRow
                                        label="Preço de Venda"
                                        value={shopeeData.orderSellingPrice}
                                        isNegative={false}
                                        isSubtotal
                                        color="green"
                                    />
                                </>
                            ) : isShopee && shopeeData.sellerDiscount > 0 && shopeeData.isLeveMaisPagueMenos ? (
                                <>
                                    <FeeRow
                                        label="Preço de Venda"
                                        value={shopeeData.orderSellingPrice}
                                        isNegative={false}
                                        color="default"
                                    />
                                    <FeeRow
                                        label="Leve Mais Pague Menos (2%)"
                                        value={shopeeData.sellerDiscount}
                                        color="orange"
                                        subLabel="Desconto bancado pelo vendedor"
                                    />
                                    <FeeRow
                                        label="Base para Cálculo"
                                        value={shopeeData.orderSellingPrice - shopeeData.sellerDiscount}
                                        isNegative={false}
                                        isSubtotal
                                        color="green"
                                    />
                                </>
                            ) : genericRefundAmount > 0 ? (
                                <>
                                    <FeeRow
                                        label="Valor Total"
                                        value={genericOriginalValue}
                                        isNegative={false}
                                        color="default"
                                    />
                                    <FeeRow
                                        label="Reembolso"
                                        value={genericRefundAmount}
                                        color="orange"
                                    />
                                    <FeeRow
                                        label="Base para Cálculo"
                                        value={breakdown.grossValue}
                                        isNegative={false}
                                        isSubtotal
                                        color="green"
                                    />
                                </>
                            ) : (
                                <FeeRow
                                    label="Preço de Venda"
                                    value={breakdown.grossValue}
                                    isNegative={false}
                                    color="green"
                                />
                            )}
                        </div>
                    </div>

                    {/* Marketplace Fees Section */}
                    <div>
                        <SectionHeader title="Taxas do Marketplace" icon="🏪" />
                        <div className="bg-white/5 rounded-2xl p-2 border border-white/5">
                            <FeeRow
                                label={`Comissão (${effectiveCommissionRate}%)${hasOverrides ? ' ⚙️' : ''}`}
                                value={effectiveCommissionFee}
                                color="red"
                            />
                            <FeeRow
                                label={`Campanha (${effectiveCampaignRate}%)${hasOverrides ? ' ⚙️' : ''}`}
                                value={effectiveCampaignFee}
                                color="red"
                            />
                            <FeeRow
                                label={`Custo Fixo (R$ ${effectiveFixedCostPerUnit} × ${effectiveUnits} un)${hasOverrides ? ' ⚙️' : ''}`}
                                value={effectiveFixedCost}
                                color="red"
                            />
                            <FeeRow
                                label="Subtotal Taxas"
                                value={subtotalMarketplaceFees}
                                isSubtotal
                                color="red"
                            />
                        </div>
                    </div>

                    {/* Seller Costs Section */}
                    <div>
                        <SectionHeader title="Custos do Vendedor" icon="🎟️" />
                        <div className="bg-white/5 rounded-2xl p-2 border border-white/5">
                            <FeeRow
                                label="Cupom Loja"
                                value={breakdown.sellerVoucher || 0}
                                color={breakdown.sellerVoucher ? 'orange' : 'gray'}
                            />
                            <FeeRow
                                label="Comissão Afiliado"
                                value={breakdown.amsCommissionFee || 0}
                                color={breakdown.amsCommissionFee ? 'purple' : 'gray'}
                            />
                            <FeeRow
                                label="Subtotal Custos"
                                value={subtotalSellerCosts}
                                isSubtotal
                                color={subtotalSellerCosts > 0 ? 'orange' : 'gray'}
                            />
                        </div>
                    </div>
                </div>

                {/* Right Column: Results */}
                <div className="space-y-6">
                    {/* Result Section */}
                    <div className="rounded-[24px] bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-white/10 p-2">
                        <SectionHeader title={`Resultado${hasOverrides ? ' (Taxas Sobrescritas)' : ''}`} icon="✨" />
                        <div className="space-y-1">
                            <FeeRow
                                label="Total Deduções"
                                value={totalDeductions}
                                color="red"
                            />
                            <div className="pt-2">
                                <FeeRow
                                    label="Valor Líquido Calculado"
                                    value={netValueCalculated}
                                    isNegative={false}
                                    isTotal
                                    color="green"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Shopee Comparison Section */}
                    {isShopee && shopeeData.escrowAmount > 0 && (
                        <div className="rounded-[24px] bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-white/10 p-2">
                            <SectionHeader title="Comparação com Shopee" icon="🔍" />
                            <div className="space-y-1">
                                <FeeRow
                                    label="Escrow Real (API Shopee)"
                                    value={shopeeData.escrowAmount}
                                    isNegative={false}
                                    color="blue"
                                />
                                <FeeRow
                                    label="Diferença"
                                    value={shopeeData.escrowDifference}
                                    isNegative={false}
                                    isTotal
                                    color={Math.abs(shopeeData.escrowDifference) <= 0.02 ? 'gray' :
                                        shopeeData.escrowDifference > 0 ? 'green' : 'red'}
                                />
                                {Math.abs(shopeeData.escrowDifference) > 0.10 && (
                                    <div className="flex items-center gap-2 mt-2 px-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                                        <span className="text-base">⚠️</span>
                                        Diferença significativa - verificar
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Shopee Vouchers */}
                    {isShopee && (shopeeData.voucherFromShopee > 0) && (
                        <div>
                            <SectionHeader title="Vouchers Aplicados" icon="🎁" />
                            <div className="bg-white/5 rounded-2xl p-2 border border-white/5">
                                <FeeRow
                                    label="Cupom Shopee"
                                    value={shopeeData.voucherFromShopee}
                                    isNegative={false}
                                    color="green"
                                    subLabel="Pago pela Shopee (Não deduz)"
                                />
                            </div>
                        </div>
                    )}

                    {/* Extrato Financeiro - Payment Breakdown */}
                    {paymentsBreakdown && paymentsBreakdown.length > 0 && (
                        <div className="rounded-[24px] bg-gradient-to-br from-yellow-500/10 to-lime-500/10 border border-white/10 p-2">
                            <SectionHeader title="Extrato Financeiro" icon="📋" />
                            <div className="space-y-1">
                                {paymentsBreakdown.map((p, idx) => {
                                    const val = Math.abs(Number(p.net_amount));
                                    const isNegative = p.is_expense;

                                    return (
                                        <div key={idx} className="flex justify-between items-center py-2 px-2 hover:bg-white/5 rounded-lg transition-colors border-b border-dashed border-white/5 last:border-0">
                                            <div className="flex flex-col">
                                                <span className="text-sm text-main/80">
                                                    {p.transaction_type || (p.is_expense ? 'Ajuste/Despesa' : 'Pagamento')}
                                                </span>
                                                {p.payment_date && (
                                                    <span className="text-[10px] text-muted">
                                                        {formatDate(p.payment_date)}
                                                    </span>
                                                )}
                                            </div>
                                            <span className={cn(
                                                "text-sm font-medium",
                                                isNegative ? "text-rose-500 dark:text-rose-400" : "text-emerald-500 dark:text-emerald-400"
                                            )}>
                                                {isNegative ? '-' : '+'}{formatBRLSimple(val)}
                                            </span>
                                        </div>
                                    );
                                })}
                                {/* Saldo Final row */}
                                {valorFinal !== undefined && (
                                    <div className="flex justify-between items-center py-2 px-2 hover:bg-white/5 rounded-lg transition-colors border-t border-solid border-white/10 pt-3 mt-1">
                                        <div className="flex flex-col">
                                            <span className="text-sm text-main font-semibold">Saldo Final</span>
                                        </div>
                                        <span className={cn(
                                            "text-base font-bold",
                                            valorFinal === 0 ? "text-muted" : valorFinal > 0 ? "text-emerald-500" : "text-rose-500"
                                        )}>
                                            {formatBRLSimple(valorFinal)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Save Button */}
            {isEditing && onSave && (
                <div className="flex justify-end pt-4 border-t border-white/10">
                    <button
                        onClick={onSave}
                        className="text-sm font-medium bg-accent text-white px-6 py-2.5 rounded-full hover:brightness-110 transition-all shadow-lg shadow-accent/20"
                    >
                        Salvar Ajustes Temporários
                    </button>
                </div>
            )}
        </div>
    );
}
