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
}

const formatBRL = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

// Row component for consistent styling
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
    const colorClasses = {
        default: 'text-gray-700 dark:text-gray-300',
        green: 'text-emerald-600 dark:text-emerald-400',
        red: 'text-red-500 dark:text-red-400',
        orange: 'text-orange-500 dark:text-orange-400',
        purple: 'text-purple-500 dark:text-purple-400',
        blue: 'text-blue-500 dark:text-blue-400',
        gray: 'text-gray-400 dark:text-gray-500',
    };

    return (
        <div className={cn(
            'flex justify-between items-center py-1.5',
            isTotal && 'border-t border-gray-200 dark:border-gray-700 pt-2 mt-1',
            isSubtotal && 'border-t border-dashed border-gray-200 dark:border-gray-600 pt-1.5 mt-0.5'
        )}>
            <div className="flex flex-col">
                <span className={cn(
                    'text-sm',
                    isTotal ? 'font-semibold' : 'text-gray-600 dark:text-gray-400',
                    isSubtotal && 'font-medium'
                )}>
                    {label}
                </span>
                {subLabel && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">{subLabel}</span>
                )}
            </div>
            <span className={cn(
                'text-sm font-mono',
                isTotal ? 'font-bold text-base' : '',
                colorClasses[color]
            )}>
                {isNegative && value > 0 ? '-' : ''}{formatBRL(Math.abs(value))}
            </span>
        </div>
    );
};

// Section header
const SectionHeader = ({ title, icon }: { title: string; icon?: string }) => (
    <div className="flex items-center gap-2 py-2 border-b border-gray-200 dark:border-gray-700 mb-2">
        {icon && <span className="text-lg">{icon}</span>}
        <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {title}
        </h5>
    </div>
);

export default function FeeBreakdownCard({
    breakdown,
    marketplace,
    isEditing = false,
    overrides = {},
    onOverrideChange,
    onSave,
    onToggleEdit,
}: FeeBreakdownCardProps) {
    const shopeeData = breakdown.shopeeData;
    const isShopee = marketplace === 'shopee' && shopeeData;

    // Calculate subtotals
    const subtotalMarketplaceFees =
        (overrides.commissionFee ?? breakdown.commissionFee) +
        (overrides.fixedCost ?? breakdown.fixedCost) +
        (overrides.campaignFee ?? (breakdown.campaignFee || 0));

    const subtotalSellerCosts =
        (breakdown.sellerVoucher || 0) +
        (breakdown.amsCommissionFee || 0);

    return (
        <div className="glass-panel p-4 rounded-xl border-l-4 border-blue-500 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    📊 Detalhamento Completo de Cálculo
                </h4>
                {onToggleEdit && (
                    <button
                        onClick={onToggleEdit}
                        className="text-xs app-btn-secondary px-2 py-1"
                    >
                        {isEditing ? 'Cancelar' : 'Ajustar'}
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column: Calculation */}
                <div className="space-y-3">
                    {/* Base Value Section */}
                    <div className="bg-white/50 dark:bg-white/5 rounded-lg p-3">
                        <SectionHeader title="Valor Base" icon="💰" />
                        {isShopee && shopeeData.sellerDiscount > 0 ? (
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

                    {/* Marketplace Fees Section */}
                    <div className="bg-white/50 dark:bg-white/5 rounded-lg p-3">
                        <SectionHeader title="Taxas do Marketplace" icon="🏪" />
                        <FeeRow
                            label={`Comissão (${breakdown.breakdown?.commissionRate || 0}%)`}
                            value={overrides.commissionFee ?? breakdown.commissionFee}
                            color="red"
                        />
                        <FeeRow
                            label={`Campanha (${breakdown.breakdown?.campaignRate || 0}%)`}
                            value={overrides.campaignFee ?? (breakdown.campaignFee || 0)}
                            color="red"
                        />
                        <FeeRow
                            label={`Custo Fixo (R$ ${breakdown.breakdown?.fixedCostPerUnit || 0} × ${breakdown.productCount || breakdown.breakdown?.units || 1} un)`}
                            value={overrides.fixedCost ?? breakdown.fixedCost}
                            color="red"
                        />
                        <FeeRow
                            label="Subtotal Taxas"
                            value={subtotalMarketplaceFees}
                            isSubtotal
                            color="red"
                        />
                    </div>

                    {/* Seller Costs Section */}
                    <div className="bg-white/50 dark:bg-white/5 rounded-lg p-3">
                        <SectionHeader title="Custos do Vendedor" icon="🎟️" />
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

                {/* Right Column: Results */}
                <div className="space-y-3">
                    {/* Result Section */}
                    <div className="bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-900/20 dark:to-blue-900/20 rounded-lg p-3">
                        <SectionHeader title="Resultado" icon="✨" />
                        <FeeRow
                            label="Total Deduções"
                            value={breakdown.totalFees}
                            color="red"
                        />
                        <FeeRow
                            label="Valor Líquido Calculado"
                            value={breakdown.netValue}
                            isNegative={false}
                            isTotal
                            color="green"
                        />
                    </div>

                    {/* Shopee Comparison Section */}
                    {isShopee && shopeeData.escrowAmount > 0 && (
                        <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-lg p-3">
                            <SectionHeader title="Comparação com Shopee" icon="🔍" />
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
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                    ⚠️ Diferença significativa - verificar taxas aplicadas
                                </p>
                            )}
                        </div>
                    )}

                    {/* Shopee Vouchers */}
                    {isShopee && (shopeeData.voucherFromShopee > 0) && (
                        <div className="bg-white/50 dark:bg-white/5 rounded-lg p-3">
                            <SectionHeader title="Vouchers Aplicados" icon="🎁" />
                            <FeeRow
                                label="Cupom Shopee (pago pela Shopee)"
                                value={shopeeData.voucherFromShopee}
                                isNegative={false}
                                color="green"
                                subLabel="Não deduzido do vendedor"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Save Button */}
            {isEditing && onSave && (
                <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={onSave}
                        className="text-xs bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Salvar Ajustes Temporários
                    </button>
                </div>
            )}
        </div>
    );
}
