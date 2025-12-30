'use client';

import { useState, useMemo, useEffect } from 'react';
import { Lightbulb, Sparkles, AlertCircle, Check, ChevronDown, ChevronUp, Edit2, ExternalLink, RefreshCw, Tag, TrendingDown, TrendingUp, X, Settings2, Link2, AlertTriangle, Calendar, Pencil, Link as LinkIcon } from 'lucide-react';
import type { AutoRule } from '@/lib/rules';
import { evaluateCondition } from '@/lib/rules/matcher';
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
    diferenca?: number;
    fee_overrides?: {
        source?: 'parsed' | 'manual';
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
    onForceSync?: (payment: PreviewPayment) => Promise<void>;
    onBulkFeeOverride?: (paymentIds: string[], overrides: { commissionFee?: number; fixedCost?: number; campaignFee?: number }) => void;
    onBulkApplyRules?: (matches: { paymentId: string; rule: AutoRule }[]) => void;
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

const MatchStatusBadge = ({ payment, hasSuggestion }: { payment: PreviewPayment; hasSuggestion?: boolean }) => {
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

    if (hasSuggestion) {
        return (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <Lightbulb className="w-4 h-4" />
                <span className="text-xs font-medium">Sugestão</span>
            </div>
        );
    }

    if (payment.matchedRuleNames && payment.matchedRuleNames.length > 0) {
        return (
            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-medium">Automático</span>
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

// ... helpers ...

export default function PaymentPreviewTable({
    payments,
    marketplace,
    onManualLink,
    onEditTags,
    onForceSync,
    onBulkFeeOverride,
    onBulkApplyRules
}: PaymentPreviewTableProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeStatusFilter, setActiveStatusFilter] = useState<'all' | 'linked' | 'unmatched' | 'attention'>('all');
    const [sortConfig, setSortConfig] = useState<{ field: SortField; direction: SortDirection }>({
        field: 'paymentDate',
        direction: 'desc'
    });
    const [selectedPayments, setSelectedPayments] = useState<string[]>([]);

    // Rule Suggestions State
    const [rules, setRules] = useState<AutoRule[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Fetch rules on mount
    useEffect(() => {
        const fetchRules = async () => {
            try {
                const response = await fetch(`/api/financeiro/rules?marketplace=${marketplace}&enabled=true`);
                const data = await response.json();
                if (data.success) {
                    // Include ALL rules (system + user) for suggestions
                    // Backend only applies system rules, so user rules need to be suggested here
                    setRules(data.rules || []);
                }
            } catch (error) {
                console.error('Error fetching rules:', error);
            }
        };
        fetchRules();
    }, [marketplace]);

    // Calculate matches
    const suggestedMatches = useMemo(() => {
        const matches = new Map<string, AutoRule>();

        if (rules.length === 0) return matches;

        payments.forEach(payment => {
            // Find first matching rule that hasn't been applied yet
            const matchedRule = rules.find(rule => {
                // Skip if this rule is already in matchedRuleNames (prevent suggesting already applied rules)
                if (payment.matchedRuleNames?.includes(rule.name)) return false;

                // Check conditions using shared matcher logic
                const paymentInput = {
                    transactionDescription: payment.transactionDescription || '',
                    transactionType: payment.transactionType || '',
                    amount: payment.netAmount,
                    marketplaceOrderId: payment.marketplaceOrderId,
                    paymentDate: payment.paymentDate || '',
                };

                // Check based on condition logic (AND/OR)
                if (rule.conditionLogic === 'OR') {
                    return rule.conditions.some(condition => evaluateCondition(condition, paymentInput).matched);
                } else {
                    return rule.conditions.every(condition => evaluateCondition(condition, paymentInput).matched);
                }
            });

            if (matchedRule) {
                matches.set(payment.marketplaceOrderId, matchedRule);
            }
        });

        return matches;
    }, [payments, rules]);

    // Auto-select all when entering suggestions mode
    useEffect(() => {
        if (showSuggestions) {
            setSelectedPayments(Array.from(suggestedMatches.keys()));
        }
    }, [showSuggestions, suggestedMatches]);

    const handleApplySuggestions = () => {
        const matchesToApply = selectedPayments
            .map(id => ({ paymentId: id, rule: suggestedMatches.get(id) }))
            .filter(m => m.rule !== undefined) as { paymentId: string; rule: AutoRule }[];

        if (onBulkApplyRules && matchesToApply.length > 0) {
            onBulkApplyRules(matchesToApply);
            setShowSuggestions(false);
            setSelectedPayments([]);
        }
    };


    // Derived state for filtered payments
    const filteredPayments = useMemo(() => {
        let result = payments;

        if (showSuggestions) {
            result = result.filter(p => suggestedMatches.has(p.marketplaceOrderId));
        } else {
            // Existing filters
            if (activeStatusFilter !== 'all') {
                if (activeStatusFilter === 'linked') result = result.filter(p => p.matchStatus === 'linked');
                if (activeStatusFilter === 'unmatched') result = result.filter(p => p.matchStatus === 'unmatched');
                if (activeStatusFilter === 'attention') result = result.filter(p => p.matchStatus === 'multiple_entries' || (p.diferenca && Math.abs(p.diferenca) > 0.05));
            }

            if (searchTerm) {
                const lowerSearch = searchTerm.toLowerCase();
                result = result.filter(p =>
                    p.marketplaceOrderId.toLowerCase().includes(lowerSearch) ||
                    p.transactionDescription?.toLowerCase().includes(lowerSearch) ||
                    p.tinyOrderInfo?.cliente_nome.toLowerCase().includes(lowerSearch)
                );
            }
        }

        return result.sort((a, b) => {
            const direction = sortConfig.direction === 'asc' ? 1 : -1;

            switch (sortConfig.field) {
                case 'paymentDate':
                    return ((a.paymentDate || '') > (b.paymentDate || '') ? 1 : -1) * direction;
                case 'orderDate':
                    return ((a.tinyOrderInfo?.data_criacao || '') > (b.tinyOrderInfo?.data_criacao || '') ? 1 : -1) * direction;
                case 'marketplaceOrderId':
                    return (a.marketplaceOrderId.localeCompare(b.marketplaceOrderId)) * direction;
                case 'valorPedido':
                    return ((a.tinyOrderInfo?.valor_total_pedido || 0) - (b.tinyOrderInfo?.valor_total_pedido || 0)) * direction;
                case 'valorEsperado':
                    return ((a.tinyOrderInfo?.valor_esperado || 0) - (b.tinyOrderInfo?.valor_esperado || 0)) * direction;
                case 'netAmount':
                    return (a.netAmount - b.netAmount) * direction;
                case 'diferenca':
                    return ((a.diferenca || 0) - (b.diferenca || 0)) * direction;
                case 'matchStatus':
                    return (a.matchStatus.localeCompare(b.matchStatus)) * direction;
                default:
                    return 0;
            }
        });
    }, [payments, searchTerm, activeStatusFilter, sortConfig, showSuggestions, suggestedMatches]);

    const toggleSort = (field: SortField) => {
        setSortConfig(prev => ({
            field,
            direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const handleSelectAll = () => {
        if (selectedPayments.length === filteredPayments.length) {
            setSelectedPayments([]);
        } else {
            setSelectedPayments(filteredPayments.map(p => p.marketplaceOrderId));
        }
    };

    const togglePaymentSelection = (id: string) => {
        if (selectedPayments.includes(id)) {
            setSelectedPayments(selectedPayments.filter(pId => pId !== id));
        } else {
            setSelectedPayments([...selectedPayments, id]);
        }
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



    const PaymentRow = ({
        payment,
        marketplace,
        onManualLink,
        onEditTags,
        onForceSync,
        isSelected,
        onToggleSelect,
    }: {
        payment: PreviewPayment;
        marketplace: string;
        onManualLink?: (payment: PreviewPayment) => void;
        onEditTags?: (payment: PreviewPayment) => void;
        onForceSync?: (payment: PreviewPayment) => Promise<void>;
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
        // Check if this payment has override applied
        // Ignore overrides that come from the parser (source: 'parsed') - these are "reconciled", not "manually overridden"
        const hasOverride = payment.fee_overrides &&
            payment.fee_overrides.source !== 'parsed' && (
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
                        <MatchStatusBadge payment={payment} hasSuggestion={suggestedMatches.has(payment.marketplaceOrderId)} />
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
                            {onForceSync && payment.marketplaceOrderId && !payment.isExpense && !payment.isAdjustment && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onForceSync(payment);
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    title="Forçar Sincronia (Tiny)"
                                >
                                    <RefreshCw className="w-3 h-3" />
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

    return (
        <div className="space-y-4">
            {/* Rule Suggestions Banner */}
            {suggestedMatches.size > 0 && !showSuggestions && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-amber-500/20">
                            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                                {suggestedMatches.size} Sugestões de Regras Encontradas
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                Regras compatíveis encontradas para {suggestedMatches.size} lançamentos.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowSuggestions(true)}
                        className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
                    >
                        Revisar {suggestedMatches.size} Sugestões
                    </button>
                </div>
            )}

            {/* Suggestions Review Mode Banner */}
            {showSuggestions && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-blue-500/20">
                            <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                                Modo de Revisão de Regras ({selectedPayments.length} selecionados)
                            </p>
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                                Selecione os itens e clique em Aplicar.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setShowSuggestions(false);
                                setSelectedPayments([]);
                            }}
                            className="px-4 py-2 rounded-lg text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleApplySuggestions}
                            disabled={selectedPayments.length === 0}
                            className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                        >
                            Aplicar Regras ({selectedPayments.length})
                        </button>
                    </div>
                </div>
            )}

            {/* Filters and Search - Hidden in Suggestions Mode if desired, or keep generic */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <input
                    type="text"
                    placeholder="Buscar por ID, descrição ou cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="app-input w-full sm:w-64 order-2 sm:order-1"
                />

                <div className="flex gap-2 order-1 sm:order-2 overflow-x-auto max-w-full pb-2 sm:pb-0 hide-scrollbar">
                    <button
                        onClick={() => setActiveStatusFilter('all')}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                            activeStatusFilter === 'all'
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        )}
                    >
                        Todos ({payments.length})
                    </button>
                    <button
                        onClick={() => setActiveStatusFilter('linked')}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                            activeStatusFilter === 'linked'
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        )}
                    >
                        Vinculados ({payments.filter(p => p.matchStatus === 'linked').length})
                    </button>
                    <button
                        onClick={() => setActiveStatusFilter('unmatched')}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                            activeStatusFilter === 'unmatched'
                                ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        )}
                    >
                        Não Vinculados ({payments.filter(p => p.matchStatus === 'unmatched').length})
                    </button>
                    <button
                        onClick={() => setActiveStatusFilter('attention')}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                            activeStatusFilter === 'attention'
                                ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        )}
                    >
                        Atenção ({payments.filter(p => p.matchStatus === 'multiple_entries' || (p.diferenca && Math.abs(p.diferenca) > 0.05)).length})
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="glass-card rounded-2xl overflow-hidden border border-white/20 dark:border-white/10">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="glass-panel border-b border-white/20 dark:border-white/10">
                            <tr>
                                <th className="px-2 py-2 text-left w-8">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        checked={selectedPayments.length > 0 && selectedPayments.length === filteredPayments.length}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <th className="px-1 py-2 w-6"></th>
                                <SortableHeader label="Data Pgto" field="paymentDate" currentSort={sortConfig} onSort={toggleSort} />
                                <SortableHeader label="Data Pedido" field="orderDate" currentSort={sortConfig} onSort={toggleSort} />
                                <SortableHeader label="ID da Transação" field="marketplaceOrderId" currentSort={sortConfig} onSort={toggleSort} />
                                <SortableHeader label="Tipo" field="transactionType" currentSort={sortConfig} onSort={toggleSort} />
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                    Descrição
                                </th>
                                <SortableHeader label="Valor Pedido" field="valorPedido" align="right" currentSort={sortConfig} onSort={toggleSort} />
                                <SortableHeader label="Valor Esperado" field="valorEsperado" align="right" currentSort={sortConfig} onSort={toggleSort} />
                                <SortableHeader label="Recebido" field="netAmount" align="right" currentSort={sortConfig} onSort={toggleSort} />
                                <SortableHeader label="Dif." field="diferenca" align="right" currentSort={sortConfig} onSort={toggleSort} />
                                <SortableHeader label="Status" field="matchStatus" currentSort={sortConfig} onSort={toggleSort} />
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                    Tags
                                </th>
                                <th className="px-2 py-2 w-20"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPayments.map((payment) => (
                                <PaymentRow
                                    key={payment.marketplaceOrderId}
                                    payment={payment}
                                    marketplace={marketplace}
                                    onManualLink={onManualLink}
                                    onEditTags={onEditTags}
                                    onForceSync={onForceSync}
                                    isSelected={selectedPayments.includes(payment.marketplaceOrderId)}
                                    onToggleSelect={() => togglePaymentSelection(payment.marketplaceOrderId)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredPayments.length === 0 && (
                    <div className="py-12 text-center text-gray-500 dark:text-gray-400">
                        Nenhum pagamento encontrado.
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper for sorting headers
function SortableHeader({
    label,
    field,
    align = 'left',
    currentSort,
    onSort
}: {
    label: string;
    field: SortField;
    align?: 'left' | 'right';
    currentSort: { field: SortField; direction: SortDirection };
    onSort: (field: SortField) => void;
}) {
    return (
        <th
            className={`px-2 py-2 text-${align} text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-white/30 dark:hover:bg-white/10 transition-colors`}
            onClick={() => onSort(field)}
        >
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
                {label}
                {currentSort.field === field && (
                    currentSort.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                )}
            </div>
        </th>
    );
}




