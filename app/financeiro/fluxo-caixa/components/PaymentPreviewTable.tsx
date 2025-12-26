'use client';

import { useState, useMemo, useEffect } from 'react';
import { Link2, LinkIcon, AlertTriangle, ChevronDown, ChevronUp, Tag, Calendar, Pencil, TrendingUp, TrendingDown, Settings2, Check, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import FeeBreakdownCard from './FeeBreakdownCard';

export type PreviewPayment = {
    marketplaceOrderId: string;
    paymentDate: string | null;
    settlementDate: string | null;
    grossAmount: number;
    netAmount: number;
    fees: number;
    discount: number;
    status: string;
    paymentMethod: string | null;
    transactionType?: string;
    transactionDescription?: string;
    balanceAfter?: number;
    tags: string[];
    isAdjustment: boolean;
    isRefund: boolean;
    isFreightAdjustment?: boolean; // Freight/weight adjustments - don't show expected/difference
    isExpense?: boolean;
    expenseCategory?: string;
    matchStatus: 'linked' | 'unmatched' | 'multiple_entries';
    tinyOrderId?: number;
    tinyOrderInfo?: {
        id: number;
        numero_pedido: string;
        cliente_nome: string;
        valor_total_pedido: number;
        valor_esperado?: number;
        fees_breakdown?: any;
        data_criacao?: string;
    };
    relatedPayments?: string[];
    matchedRuleNames?: string[];  // Rules that were automatically applied
    netBalance?: number;
    fee_overrides?: {
        commissionFee?: number;
        fixedCost?: number;
        campaignFee?: number;
        shippingFee?: number;
        otherFees?: number;
        notes?: string;
        usesFreeShipping?: boolean;
    };
};

// Sorting types
type SortField = 'paymentDate' | 'orderDate' | 'marketplaceOrderId' | 'transactionType' | 'valorPedido' | 'valorEsperado' | 'netAmount' | 'diferenca' | 'matchStatus';
type SortDirection = 'asc' | 'desc';

interface PaymentPreviewTableProps {
    payments: PreviewPayment[];
    marketplace: string;
    onManualLink?: (payment: PreviewPayment) => void;
    onEditTags?: (payment: PreviewPayment) => void;
    onBulkFeeOverride?: (paymentIds: string[], overrides: { commissionFee?: number; fixedCost?: number; campaignFee?: number }) => void;
}

const formatBRL = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    // Add T12:00:00 to avoid timezone issues (midnight UTC becomes previous day in BRT)
    const normalizedDate = dateStr.includes('T') ? dateStr : `${dateStr.split(' ')[0]}T12:00:00`;
    const date = new Date(normalizedDate);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const formatDateFull = (dateStr: string | null) => {
    if (!dateStr) return '-';
    // Add T12:00:00 to avoid timezone issues (midnight UTC becomes previous day in BRT)
    const normalizedDate = dateStr.includes('T') ? dateStr : `${dateStr.split(' ')[0]}T12:00:00`;
    const date = new Date(normalizedDate);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const MatchStatusBadge = ({ payment }: { payment: PreviewPayment }) => {
    const { matchStatus, isExpense, isAdjustment, isFreightAdjustment } = payment;
    const isOrder = !isExpense && !isAdjustment && !isFreightAdjustment;

    if (matchStatus === 'linked') {
        return (
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <Link2 className="w-4 h-4" />
                <span className="text-xs font-medium">Vinculado</span>
            </div>
        );
    }

    if (matchStatus === 'multiple_entries') {
        return (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-medium">Múltiplas Entradas</span>
            </div>
        );
    }

    // Hide "Não Vinculado" for non-orders (expenses, adjustments, etc)
    if (!isOrder) {
        return (
            <span className="text-xs text-muted italic">-</span>
        );
    }

    return (
        <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
            <LinkIcon className="w-4 h-4 opacity-50" />
            <span className="text-xs font-medium">Não Vinculado</span>
        </div>
    );
};

const TypeBadge = ({ isExpense }: { isExpense?: boolean }) => {
    if (isExpense) {
        return (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                <TrendingDown className="w-3 h-3" />
                Saída
            </div>
        );
    }
    return (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <TrendingUp className="w-3 h-3" />
            Entrada
        </div>
    );
};

const TagBadge = ({ tag }: { tag: string }) => {
    const tagColors: Record<string, string> = {
        'reembolso': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        'devolucao': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        'ajuste': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        'taxa': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
        'frete': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
        'anuncio': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
        'marketing': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
        'retirada': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
        'multiple_entries': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        'has_refund': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        'has_adjustment': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        'Entradas Múltiplas': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        'Possui Reembolso': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        'Possui Ajuste': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        'Saldo Zero': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    };

    const colorClass = tagColors[tag] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';

    return (
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', colorClass)}>
            <Tag className="w-3 h-3" />
            {tag}
        </span>
    );
};

// Sortable Header Component
const SortableHeader = ({
    label,
    field,
    currentField,
    direction,
    onSort,
    align = 'left',
}: {
    label: string;
    field: SortField;
    currentField: SortField | null;
    direction: SortDirection;
    onSort: (field: SortField) => void;
    align?: 'left' | 'right';
}) => {
    const isActive = currentField === field;
    return (
        <th
            className={cn(
                "px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-white/30 dark:hover:bg-white/10 transition-colors select-none",
                align === 'right' ? 'text-right' : 'text-left',
                isActive && "bg-white/20 dark:bg-white/5"
            )}
            onClick={() => onSort(field)}
        >
            <div className={cn("flex items-center gap-1", align === 'right' && "justify-end")}>
                {label}
                <span className={cn("transition-opacity", isActive ? "opacity-100" : "opacity-30")}>
                    {isActive && direction === 'asc' ? (
                        <ChevronUp className="w-3 h-3" />
                    ) : (
                        <ChevronDown className="w-3 h-3" />
                    )}
                </span>
            </div>
        </th>
    );
};

const PaymentRow = ({
    payment,
    marketplace,
    onManualLink,
    onEditTags,
    isSelected,
    onToggleSelect,
}: {
    payment: PreviewPayment;
    marketplace: string;
    onManualLink?: (payment: PreviewPayment) => void;
    onEditTags?: (payment: PreviewPayment) => void;
    isSelected: boolean;
    onToggleSelect: () => void;
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditingFees, setIsEditingFees] = useState(false);
    const [overrides, setOverrides] = useState(payment.fee_overrides || {});

    // Sync local overrides state when payment.fee_overrides changes (e.g., from bulk override)
    useEffect(() => {
        setOverrides(payment.fee_overrides || {});
    }, [payment.fee_overrides]);

    const hasDetails = payment.matchStatus === 'multiple_entries' || payment.transactionDescription || payment.tinyOrderInfo;

    const feesBreakdown = payment.tinyOrderInfo?.fees_breakdown;

    const handleSaveFees = () => {
        payment.fee_overrides = overrides;
        if (feesBreakdown) {
            const commissionRate = overrides.usesFreeShipping ? 20 : (feesBreakdown.breakdown?.commissionRate || 14);
            const commission = overrides.commissionFee !== undefined ? Number(overrides.commissionFee) : (feesBreakdown.grossValue * commissionRate / 100);
            const fixed = overrides.fixedCost !== undefined ? Number(overrides.fixedCost) : feesBreakdown.fixedCost;
            const campaign = overrides.campaignFee !== undefined ? Number(overrides.campaignFee) : (feesBreakdown.campaignFee || 0);
            const sellerVoucher = feesBreakdown.sellerVoucher || feesBreakdown.breakdown?.sellerVoucher || 0;
            const amsCommissionFee = feesBreakdown.amsCommissionFee || feesBreakdown.breakdown?.amsCommissionFee || 0;

            const total = commission + fixed + campaign + sellerVoucher + amsCommissionFee;
            payment.tinyOrderInfo!.valor_esperado = feesBreakdown.grossValue - total;
        }
        setIsEditingFees(false);
    };

    // Check if this payment has override applied
    const hasOverride = payment.fee_overrides && (
        payment.fee_overrides.commissionFee !== undefined ||
        payment.fee_overrides.fixedCost !== undefined ||
        payment.fee_overrides.campaignFee !== undefined
    );

    // Helper to determine if we should show expected value/difference
    const isOrderIncome = payment.transactionType?.toLowerCase().includes('renda') ||
        payment.transactionType?.toLowerCase().includes('sale') ||
        payment.transactionType?.toLowerCase().includes('receita');

    const isAdjustmentOrOther = payment.isFreightAdjustment ||
        payment.transactionType?.toLowerCase().includes('ajuste') ||
        payment.transactionType?.toLowerCase().includes('recarga') ||
        payment.transactionType?.toLowerCase().includes('reembolso') ||
        payment.transactionType?.toLowerCase().includes('adjustment') ||
        payment.transactionType?.toLowerCase().includes('withdraw') ||
        payment.transactionType?.toLowerCase().includes('retirada') ||
        payment.transactionType?.toLowerCase().includes('diferença') ||
        payment.transactionType?.toLowerCase().includes('diferenca') ||
        payment.marketplaceOrderId.endsWith('_AJUSTE') ||
        payment.marketplaceOrderId.endsWith('_REEMBOLSO');

    const shouldShowExpected = !isAdjustmentOrOther && payment.tinyOrderInfo?.valor_esperado;

    return (
        <>
            <tr className={cn(
                "border-b border-white/20 dark:border-white/10 hover:bg-white/30 dark:hover:bg-white/15 transition-colors",
                isSelected ? "bg-blue-50/50 dark:bg-blue-900/20" : "bg-white/20 dark:bg-white/10",
                hasOverride && "ring-2 ring-inset ring-purple-400/50 dark:ring-purple-500/30"
            )}>
                {/* Checkbox column */}
                <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={onToggleSelect}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 border-gray-300 dark:border-gray-600 cursor-pointer"
                    />
                </td>
                <td className="px-1 py-2 cursor-pointer" onClick={() => hasDetails && setIsExpanded(!isExpanded)}>
                    {hasDetails && (
                        <button className="p-1 rounded-full bg-white/30 dark:bg-white/10 hover:bg-white/50 dark:hover:bg-white/15 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors border border-white/20 dark:border-white/10">
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                    )}
                </td>
                <td className="px-2 py-2 text-xs" title={formatDateFull(payment.paymentDate)}>
                    {formatDate(payment.paymentDate)}
                </td>
                <td className="px-2 py-2 text-xs text-blue-600 dark:text-blue-400" title={formatDateFull(payment.tinyOrderInfo?.data_criacao || null)}>
                    {payment.tinyOrderInfo?.data_criacao ? formatDate(payment.tinyOrderInfo.data_criacao) : '-'}
                </td>
                <td className="px-2 py-2 text-xs font-mono truncate max-w-[100px]" title={payment.marketplaceOrderId}>{payment.marketplaceOrderId}</td>
                <td className="px-2 py-2 text-xs truncate max-w-[80px]" title={payment.transactionType}>
                    {payment.transactionType || '-'}
                </td>
                <td className="px-2 py-2 text-xs max-w-[100px] truncate" title={payment.transactionDescription}>
                    {payment.transactionDescription || '-'}
                </td>
                {/* Value columns */}
                <td className="px-2 py-2 text-xs text-right tabular-nums">
                    {payment.tinyOrderInfo?.valor_total_pedido ? formatBRL(payment.tinyOrderInfo.valor_total_pedido) : '-'}
                </td>
                <td className="px-2 py-2 text-xs text-right tabular-nums">
                    {/* Hide expected value for adjustments/recharges - they don't have product-based expectations */}
                    {!shouldShowExpected ? (
                        <span className="text-muted" title="Sem valor esperado para este tipo">-</span>
                    ) : (
                        <div className="flex items-center justify-end gap-0.5">
                            {hasOverride && <span title="Taxa modificada"><Settings2 className="w-3 h-3 text-purple-500" /></span>}
                            {payment.tinyOrderInfo?.valor_esperado ? formatBRL(payment.tinyOrderInfo.valor_esperado) : '-'}
                        </div>
                    )}
                </td>
                <td className={cn(
                    "px-2 py-2 text-xs font-semibold text-right tabular-nums",
                    payment.isExpense
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-600 dark:text-emerald-400"
                )}>
                    {payment.isExpense ? '-' : '+'}{formatBRL(Math.abs(payment.netAmount))}
                </td>
                <td className="px-2 py-2 text-xs text-right tabular-nums">
                    {/* Hide difference for adjustments/recharges */}
                    {!shouldShowExpected ? (
                        <span className="text-muted" title="Sem diferença calculável">-</span>
                    ) : payment.tinyOrderInfo?.valor_esperado ? (
                        <span className={cn(
                            'font-medium',
                            Math.abs(payment.netAmount - payment.tinyOrderInfo.valor_esperado) <= 0.02
                                ? 'text-gray-400 dark:text-gray-500'
                                : (payment.netAmount - payment.tinyOrderInfo.valor_esperado) > 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-red-600 dark:text-red-400'
                        )}>
                            {formatBRL(payment.netAmount - payment.tinyOrderInfo.valor_esperado)}
                        </span>
                    ) : '-'}
                </td>
                <td className="px-2 py-2">
                    <MatchStatusBadge payment={payment} />
                </td>
                <td className="px-2 py-2 max-w-[100px]">
                    <div className="flex items-center gap-1">
                        {/* Rule applied indicator */}
                        {payment.matchedRuleNames && payment.matchedRuleNames.length > 0 && (
                            <span
                                title={`Regras aplicadas: ${payment.matchedRuleNames.join(', ')}`}
                                className="flex-shrink-0 text-purple-500"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                            </span>
                        )}
                        <div className="flex flex-wrap gap-0.5">
                            {payment.tags.slice(0, 1).map(tag => (
                                <TagBadge key={tag} tag={tag} />
                            ))}
                            {payment.tags.length > 1 && (
                                <span className="text-[10px] text-gray-500">+{payment.tags.length - 1}</span>
                            )}
                        </div>
                    </div>
                </td>
                <td className="px-2 py-2">
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {payment.matchStatus === 'unmatched' && onManualLink && (
                            <button
                                onClick={() => onManualLink(payment)}
                                className="app-btn-secondary text-[10px] px-2 py-1"
                            >
                                <LinkIcon className="w-3 h-3" />
                            </button>
                        )}
                        {onEditTags && (
                            <button
                                onClick={() => onEditTags(payment)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                                title="Editar"
                            >
                                <Pencil className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </td>
            </tr>
            {isExpanded && hasDetails && (
                <tr className="bg-transparent">
                    <td colSpan={13} className="px-2 py-3">
                        <div className="space-y-3">
                            {payment.tinyOrderInfo && (
                                <div className="glass-panel p-3 rounded-lg">
                                    <p className="text-xs text-muted mb-1">Pedido Tiny</p>
                                    <p className="text-sm font-medium">
                                        #{payment.tinyOrderInfo.numero_pedido} - {payment.tinyOrderInfo.cliente_nome}
                                    </p>
                                </div>
                            )}

                            {payment.relatedPayments && payment.relatedPayments.length > 0 && (
                                <div className="glass-panel p-3 rounded-lg">
                                    <p className="text-xs text-muted mb-1">Pagamentos Relacionados</p>
                                    <div className="flex flex-wrap gap-2">
                                        {payment.relatedPayments.map((id, i) => (
                                            <span key={i} className="text-xs font-mono bg-white/30 dark:bg-white/10 px-2 py-1 rounded">
                                                {id}
                                            </span>
                                        ))}
                                    </div>
                                    {payment.netBalance !== undefined && (
                                        <p className="text-sm mt-2">
                                            Saldo líquido: <span className="font-semibold">{formatBRL(payment.netBalance)}</span>
                                        </p>
                                    )}
                                </div>
                            )}

                            {feesBreakdown && (
                                <div onClick={(e) => e.stopPropagation()}>
                                    <FeeBreakdownCard
                                        breakdown={feesBreakdown}
                                        marketplace={marketplace}
                                        isEditing={isEditingFees}
                                        overrides={overrides}
                                        onOverrideChange={(field, value) => setOverrides({ ...overrides, [field]: value })}
                                        onSave={handleSaveFees}
                                        onToggleEdit={() => setIsEditingFees(!isEditingFees)}
                                    />
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

// Bulk Fee Override Panel Component
const BulkFeeOverridePanel = ({
    selectedCount,
    marketplace,
    onApply,
    onCancel,
}: {
    selectedCount: number;
    marketplace: string;
    onApply: (overrides: { commissionRate?: number; campaignRate?: number; fixedCostPerProduct?: number }) => void;
    onCancel: () => void;
}) => {
    const [commissionRate, setCommissionRate] = useState<string>('');
    const [campaignRate, setCampaignRate] = useState<string>('');
    const [fixedCostPerProduct, setFixedCostPerProduct] = useState<string>('');

    const handleApply = () => {
        const overrides: { commissionRate?: number; campaignRate?: number; fixedCostPerProduct?: number } = {};
        if (commissionRate !== '') overrides.commissionRate = parseFloat(commissionRate);
        if (campaignRate !== '') overrides.campaignRate = parseFloat(campaignRate);
        if (fixedCostPerProduct !== '') overrides.fixedCostPerProduct = parseFloat(fixedCostPerProduct);
        onApply(overrides);
    };

    // Default placeholders based on marketplace (Jan 2025 old rates)
    const getPlaceholders = () => {
        const lowerMp = marketplace?.toLowerCase() || '';
        if (lowerMp.includes('shopee')) {
            return { commission: '14', campaign: '5', fixed: '6.00' };
        } else if (lowerMp.includes('mercado') || lowerMp.includes('meli')) {
            return { commission: '16', campaign: '', fixed: '6.00' };
        } else if (lowerMp.includes('magalu')) {
            return { commission: '16', campaign: '', fixed: '5.00' };
        }
        return { commission: '14', campaign: '5', fixed: '6.00' };
    };

    const placeholders = getPlaceholders();
    const showCampaign = marketplace?.toLowerCase().includes('shopee');

    return (
        <div className="glass-panel glass-tint p-4 rounded-xl border border-purple-500/30 dark:border-purple-400/20 mb-4">
            <div className="flex items-center gap-3 mb-3">
                <Settings2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h4 className="font-semibold text-main">Sobrescrever Taxas ({selectedCount} selecionados)</h4>
            </div>
            <p className="text-xs text-muted mb-4">
                Configure as taxas conforme o padrão de <strong>/configuracoes/taxas-marketplace</strong>.
                Útil para importar extratos de períodos com taxas diferentes (ex: Janeiro/2025).
            </p>
            <div className={cn("grid gap-4", showCampaign ? "grid-cols-3" : "grid-cols-2")}>
                <div>
                    <label className="block text-xs font-medium text-muted mb-1">Comissão (%)</label>
                    <div className="relative">
                        <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={commissionRate}
                            onChange={(e) => setCommissionRate(e.target.value)}
                            placeholder={placeholders.commission}
                            className="app-input w-full text-sm pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
                    </div>
                    <p className="text-[10px] text-muted mt-1">Ex: base_commission da Shopee</p>
                </div>
                {showCampaign && (
                    <div>
                        <label className="block text-xs font-medium text-muted mb-1">Taxa Campanha (%)</label>
                        <div className="relative">
                            <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={campaignRate}
                                onChange={(e) => setCampaignRate(e.target.value)}
                                placeholder={placeholders.campaign}
                                className="app-input w-full text-sm pr-8"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
                        </div>
                        <p className="text-[10px] text-muted mt-1">campaign_fee_default</p>
                    </div>
                )}
                <div>
                    <label className="block text-xs font-medium text-muted mb-1">Custo Fixo por Produto (R$)</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">R$</span>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={fixedCostPerProduct}
                            onChange={(e) => setFixedCostPerProduct(e.target.value)}
                            placeholder={placeholders.fixed}
                            className="app-input w-full text-sm pl-10"
                        />
                    </div>
                    <p className="text-[10px] text-muted mt-1">fixed_cost_per_product</p>
                </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
                <button onClick={onCancel} className="app-btn-secondary px-4 py-2 text-sm">
                    <X className="w-4 h-4 mr-1" />
                    Cancelar
                </button>
                <button onClick={handleApply} className="app-btn-primary px-4 py-2 text-sm">
                    <Check className="w-4 h-4 mr-1" />
                    Aplicar aos Selecionados
                </button>
            </div>
        </div>
    );
};

export default function PaymentPreviewTable({
    payments,
    marketplace,
    onManualLink,
    onEditTags,
    onBulkFeeOverride,
}: PaymentPreviewTableProps) {
    const [filterStatus, setFilterStatus] = useState<'all' | 'linked' | 'unmatched' | 'multiple_entries' | 'income' | 'expense' | 'tagged'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showBulkPanel, setShowBulkPanel] = useState(false);
    const [sortField, setSortField] = useState<SortField | null>('paymentDate');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const filteredPayments = useMemo(() => {
        let result = payments.filter(p => {
            let matchesFilter = filterStatus === 'all' || p.matchStatus === filterStatus;
            if (filterStatus === 'income') matchesFilter = !p.isExpense;
            if (filterStatus === 'expense') matchesFilter = !!p.isExpense;
            if (filterStatus === 'tagged') matchesFilter = p.tags && p.tags.length > 0;
            const matchesSearch = searchTerm === '' ||
                p.marketplaceOrderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.transactionDescription?.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesFilter && matchesSearch;
        });

        // Apply sorting
        if (sortField) {
            result = [...result].sort((a, b) => {
                let aVal: any;
                let bVal: any;

                switch (sortField) {
                    case 'paymentDate':
                        aVal = a.paymentDate || '';
                        bVal = b.paymentDate || '';
                        break;
                    case 'orderDate':
                        aVal = a.tinyOrderInfo?.data_criacao || '';
                        bVal = b.tinyOrderInfo?.data_criacao || '';
                        break;
                    case 'marketplaceOrderId':
                        aVal = a.marketplaceOrderId;
                        bVal = b.marketplaceOrderId;
                        break;
                    case 'transactionType':
                        aVal = a.transactionType || '';
                        bVal = b.transactionType || '';
                        break;
                    case 'valorPedido':
                        aVal = a.tinyOrderInfo?.valor_total_pedido || 0;
                        bVal = b.tinyOrderInfo?.valor_total_pedido || 0;
                        break;
                    case 'valorEsperado':
                        aVal = a.tinyOrderInfo?.valor_esperado || 0;
                        bVal = b.tinyOrderInfo?.valor_esperado || 0;
                        break;
                    case 'netAmount':
                        aVal = a.netAmount;
                        bVal = b.netAmount;
                        break;
                    case 'diferenca':
                        aVal = a.tinyOrderInfo?.valor_esperado ? a.netAmount - a.tinyOrderInfo.valor_esperado : 0;
                        bVal = b.tinyOrderInfo?.valor_esperado ? b.netAmount - b.tinyOrderInfo.valor_esperado : 0;
                        break;
                    case 'matchStatus':
                        const statusOrder = { linked: 0, multiple_entries: 1, unmatched: 2 };
                        aVal = statusOrder[a.matchStatus] ?? 3;
                        bVal = statusOrder[b.matchStatus] ?? 3;
                        break;
                    default:
                        aVal = '';
                        bVal = '';
                }

                if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [payments, filterStatus, searchTerm, sortField, sortDirection]);

    const incomeCount = payments.filter(p => !p.isExpense).length;
    const expenseCount = payments.filter(p => p.isExpense).length;

    // Selection logic
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredPayments.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredPayments.map(p => p.marketplaceOrderId)));
        }
    };

    const handleBulkApply = (overrides: { commissionRate?: number; campaignRate?: number; fixedCostPerProduct?: number }) => {
        // Apply overrides to selected payments using percentage rates
        payments.forEach(p => {
            if (selectedIds.has(p.marketplaceOrderId)) {
                // Store the rate-based overrides
                const newOverrides: any = { ...p.fee_overrides };
                if (overrides.commissionRate !== undefined) newOverrides.commissionRate = overrides.commissionRate;
                if (overrides.campaignRate !== undefined) newOverrides.campaignRate = overrides.campaignRate;
                if (overrides.fixedCostPerProduct !== undefined) newOverrides.fixedCostPerProduct = overrides.fixedCostPerProduct;
                p.fee_overrides = newOverrides;

                // Recalculate valor_esperado if we have breakdown
                if (p.tinyOrderInfo?.fees_breakdown) {
                    const fb = p.tinyOrderInfo.fees_breakdown;
                    const grossValue = fb.grossValue || 0;
                    const productCount = fb.breakdown?.units || fb.units || 1;

                    // Calculate fees from rates
                    const commissionRate = overrides.commissionRate ?? fb.breakdown?.commissionRate ?? 14;
                    const campaignRate = overrides.campaignRate ?? fb.breakdown?.campaignRate ?? 0;
                    const fixedPerProduct = overrides.fixedCostPerProduct ?? fb.breakdown?.fixedCostPerUnit ?? fb.fixedCost / productCount;

                    const commissionFee = grossValue * (commissionRate / 100);
                    const campaignFee = grossValue * (campaignRate / 100);
                    const fixedCost = fixedPerProduct * productCount;
                    const sellerVoucher = fb.sellerVoucher || fb.breakdown?.sellerVoucher || 0;
                    const amsCommissionFee = fb.amsCommissionFee || fb.breakdown?.amsCommissionFee || 0;

                    // Store calculated values for display
                    newOverrides.commissionFee = commissionFee;
                    newOverrides.campaignFee = campaignFee;
                    newOverrides.fixedCost = fixedCost;
                    p.fee_overrides = newOverrides;

                    const totalFees = commissionFee + campaignFee + fixedCost + sellerVoucher + amsCommissionFee;
                    p.tinyOrderInfo.valor_esperado = grossValue - totalFees;
                }
            }
        });

        // Notify parent if callback provided
        if (onBulkFeeOverride) {
            onBulkFeeOverride(Array.from(selectedIds), overrides as any);
        }

        setShowBulkPanel(false);
        setSelectedIds(new Set());
    };

    const allSelected = filteredPayments.length > 0 && selectedIds.size === filteredPayments.length;
    const someSelected = selectedIds.size > 0;

    return (
        <div className="space-y-4">
            {/* Filters and Bulk Actions */}
            <div className="flex items-center gap-4 flex-wrap">
                <input
                    type="text"
                    placeholder="Buscar por ID ou descrição..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="app-input flex-1 max-w-md"
                />

                {/* Bulk Override Button */}
                {someSelected && (
                    <button
                        onClick={() => setShowBulkPanel(!showBulkPanel)}
                        className={cn(
                            "app-btn-secondary inline-flex items-center gap-2",
                            showBulkPanel && "bg-purple-100 dark:bg-purple-900/30"
                        )}
                    >
                        <Settings2 className="w-4 h-4 text-purple-600" />
                        Sobrescrever Taxas ({selectedIds.size})
                    </button>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={() => setFilterStatus('all')}
                        className={cn('app-btn-secondary', filterStatus === 'all' && 'bg-blue-100 dark:bg-blue-900/30')}
                    >
                        Todos ({payments.length})
                    </button>
                    <button
                        onClick={() => setFilterStatus('linked')}
                        className={cn('app-btn-secondary', filterStatus === 'linked' && 'bg-emerald-100 dark:bg-emerald-900/30')}
                    >
                        Vinculados ({payments.filter(p => p.matchStatus === 'linked').length})
                    </button>
                    <button
                        onClick={() => setFilterStatus('unmatched')}
                        className={cn('app-btn-secondary', filterStatus === 'unmatched' && 'bg-red-100 dark:bg-red-900/30')}
                    >
                        Não Vinculados ({payments.filter(p => p.matchStatus === 'unmatched').length})
                    </button>
                    <button
                        onClick={() => setFilterStatus('multiple_entries')}
                        className={cn('app-btn-secondary', filterStatus === 'multiple_entries' && 'bg-amber-100 dark:bg-amber-900/30')}
                    >
                        Múltiplos ({payments.filter(p => p.matchStatus === 'multiple_entries').length})
                    </button>
                    <span className="border-l border-gray-300 dark:border-gray-600 h-6" />
                    <button
                        onClick={() => setFilterStatus('income')}
                        className={cn('app-btn-secondary', filterStatus === 'income' && 'bg-emerald-100 dark:bg-emerald-900/30')}
                    >
                        <TrendingUp className="w-4 h-4 mr-1 text-emerald-600" />
                        Entradas ({incomeCount})
                    </button>
                    <button
                        onClick={() => setFilterStatus('expense')}
                        className={cn('app-btn-secondary', filterStatus === 'expense' && 'bg-rose-100 dark:bg-rose-900/30')}
                    >
                        <TrendingDown className="w-4 h-4 mr-1 text-rose-600" />
                        Saídas ({expenseCount})
                    </button>
                    <button
                        onClick={() => setFilterStatus('tagged')}
                        className={cn('app-btn-secondary', filterStatus === 'tagged' && 'bg-purple-100 dark:bg-purple-900/30')}
                    >
                        🏷️ Com Tags ({payments.filter(p => p.tags && p.tags.length > 0).length})
                    </button>
                </div>
            </div>

            {/* Bulk Fee Override Panel */}
            {showBulkPanel && someSelected && (
                <BulkFeeOverridePanel
                    selectedCount={selectedIds.size}
                    marketplace={marketplace}
                    onApply={handleBulkApply}
                    onCancel={() => setShowBulkPanel(false)}
                />
            )}

            {/* Table */}
            <div className="glass-card rounded-2xl overflow-hidden border border-white/20 dark:border-white/10">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="glass-panel border-b border-white/20 dark:border-white/10">
                            <tr>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-8">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 border-gray-300 dark:border-gray-600 cursor-pointer"
                                    />
                                </th>
                                <th className="px-1 py-2 w-6"></th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-white/30 dark:hover:bg-white/10"
                                    onClick={() => handleSort('paymentDate')}
                                    title="Data do Pagamento">
                                    <div className="flex items-center gap-0.5">
                                        Pgto
                                        {sortField === 'paymentDate' && (
                                            sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider cursor-pointer hover:bg-white/30 dark:hover:bg-white/10"
                                    onClick={() => handleSort('orderDate')}
                                    title="Data do Pedido">
                                    <div className="flex items-center gap-0.5">
                                        Pedido
                                        {sortField === 'orderDate' && (
                                            sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-white/30 dark:hover:bg-white/10"
                                    onClick={() => handleSort('marketplaceOrderId')}>
                                    <div className="flex items-center gap-0.5">
                                        ID
                                        {sortField === 'marketplaceOrderId' && (
                                            sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-white/30 dark:hover:bg-white/10"
                                    onClick={() => handleSort('transactionType')}>
                                    <div className="flex items-center gap-0.5">
                                        Tipo
                                        {sortField === 'transactionType' && (
                                            sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Desc.</th>
                                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-white/30 dark:hover:bg-white/10"
                                    onClick={() => handleSort('valorPedido')}>
                                    <div className="flex items-center justify-end gap-0.5">
                                        Pedido
                                        {sortField === 'valorPedido' && (
                                            sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-white/30 dark:hover:bg-white/10"
                                    onClick={() => handleSort('valorEsperado')}>
                                    <div className="flex items-center justify-end gap-0.5">
                                        Esperado
                                        {sortField === 'valorEsperado' && (
                                            sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-white/30 dark:hover:bg-white/10"
                                    onClick={() => handleSort('netAmount')}>
                                    <div className="flex items-center justify-end gap-0.5">
                                        Recebido
                                        {sortField === 'netAmount' && (
                                            sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-white/30 dark:hover:bg-white/10"
                                    onClick={() => handleSort('diferenca')}>
                                    <div className="flex items-center justify-end gap-0.5">
                                        Dif.
                                        {sortField === 'diferenca' && (
                                            sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-white/30 dark:hover:bg-white/10"
                                    onClick={() => handleSort('matchStatus')}>
                                    <div className="flex items-center gap-0.5">
                                        Status
                                        {sortField === 'matchStatus' && (
                                            sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Tags</th>
                                <th className="px-2 py-2 w-12"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPayments.map((payment, index) => (
                                <PaymentRow
                                    key={`${payment.marketplaceOrderId}-${index}`}
                                    payment={payment}
                                    marketplace={marketplace}
                                    onManualLink={onManualLink}
                                    onEditTags={onEditTags}
                                    isSelected={selectedIds.has(payment.marketplaceOrderId)}
                                    onToggleSelect={() => toggleSelect(payment.marketplaceOrderId)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredPayments.length === 0 && (
                    <div className="py-12 text-center text-gray-500 dark:text-gray-400">
                        Nenhum pagamento encontrado com os filtros aplicados
                    </div>
                )}
            </div>
        </div>
    );
}
