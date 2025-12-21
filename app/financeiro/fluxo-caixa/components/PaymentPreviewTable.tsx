'use client';

import { useState } from 'react';
import { Link2, LinkIcon, AlertTriangle, ChevronDown, ChevronUp, Tag, Calendar, Pencil } from 'lucide-react';
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
    };
    relatedPayments?: string[];
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

interface PaymentPreviewTableProps {
    payments: PreviewPayment[];
    marketplace: string;
    onManualLink?: (payment: PreviewPayment) => void;
    onEditTags?: (payment: PreviewPayment) => void;
}

const formatBRL = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const MatchStatusBadge = ({ status, hasMultiple }: { status: PreviewPayment['matchStatus']; hasMultiple?: boolean }) => {
    if (status === 'linked') {
        return (
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <Link2 className="w-4 h-4" />
                <span className="text-xs font-medium">Vinculado</span>
            </div>
        );
    }

    if (status === 'multiple_entries') {
        return (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-medium">Múltiplas Entradas</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
            <LinkIcon className="w-4 h-4 opacity-50" />
            <span className="text-xs font-medium">Não Vinculado</span>
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
        // Portuguese tag names
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
}: {
    payment: PreviewPayment;
    marketplace: string;
    onManualLink?: (payment: PreviewPayment) => void;
    onEditTags?: (payment: PreviewPayment) => void;
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditingFees, setIsEditingFees] = useState(false);
    const [overrides, setOverrides] = useState(payment.fee_overrides || {});

    const hasDetails = payment.matchStatus === 'multiple_entries' || payment.transactionDescription || payment.tinyOrderInfo;

    const feesBreakdown = payment.tinyOrderInfo?.fees_breakdown;

    const handleSaveFees = () => {
        payment.fee_overrides = overrides;
        // Recalculate local values for display
        if (feesBreakdown) {
            const commissionRate = overrides.usesFreeShipping ? 20 : (feesBreakdown.breakdown?.commissionRate || 14);
            const commission = overrides.commissionFee !== undefined ? Number(overrides.commissionFee) : (feesBreakdown.grossValue * commissionRate / 100);
            const fixed = overrides.fixedCost !== undefined ? Number(overrides.fixedCost) : feesBreakdown.fixedCost;
            const campaign = overrides.campaignFee !== undefined ? Number(overrides.campaignFee) : (feesBreakdown.campaignFee || 0);
            const sellerVoucher = feesBreakdown.sellerVoucher || feesBreakdown.breakdown?.sellerVoucher || 0;
            const amsCommissionFee = feesBreakdown.amsCommissionFee || feesBreakdown.breakdown?.amsCommissionFee || 0;

            const total = commission + fixed + campaign + sellerVoucher + amsCommissionFee;
            payment.tinyOrderInfo!.valor_esperado = feesBreakdown.grossValue - total;

            // Update overrides with new commission if toggle changed but fee wasn't manually set
            if (overrides.commissionFee === undefined) {
                // We keep it as undefined so it stays dynamic? 
                // No, better to set it if we want to persist the exact value.
                // Actually, the API will use the 20% base if the flag is on.
            }
        }
        setIsEditingFees(false);
    };

    return (
        <>
            <tr className="bg-white/20 dark:bg-white/10 border-b border-white/20 dark:border-white/10 hover:bg-white/30 dark:hover:bg-white/15 transition-colors cursor-pointer" onClick={() => hasDetails && setIsExpanded(!isExpanded)}>
                <td className="px-4 py-3">
                    {hasDetails && (
                        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    )}
                </td>
                <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {formatDate(payment.paymentDate)}
                    </div>
                </td>
                <td className="px-4 py-3 text-sm font-mono">{payment.marketplaceOrderId}</td>
                <td className="px-4 py-3 text-sm">
                    {payment.transactionType || '-'}
                </td>
                <td className="px-4 py-3 text-sm max-w-xs truncate" title={payment.transactionDescription}>
                    {payment.transactionDescription || '-'}
                </td>
                {/* Value columns */}
                <td className="px-4 py-3 text-sm text-right">
                    {payment.tinyOrderInfo?.valor_total_pedido ? formatBRL(payment.tinyOrderInfo.valor_total_pedido) : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-right">
                    {payment.tinyOrderInfo?.valor_esperado ? formatBRL(payment.tinyOrderInfo.valor_esperado) : '-'}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-right">
                    {formatBRL(payment.netAmount)}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-right">
                    {payment.tinyOrderInfo?.valor_esperado ? (() => {
                        const diff = payment.netAmount - payment.tinyOrderInfo.valor_esperado;
                        const isWithinTolerance = Math.abs(diff) <= 0.02;
                        const colorClass = isWithinTolerance
                            ? 'text-gray-500 dark:text-gray-400'
                            : diff >= 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400';
                        return (
                            <span className={colorClass}>
                                {formatBRL(diff)}
                            </span>
                        );
                    })() : '-'}
                </td>
                <td className="px-4 py-3">
                    <MatchStatusBadge status={payment.matchStatus} />
                </td>
                <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                        {payment.tags.slice(0, 3).map(tag => (
                            <TagBadge key={tag} tag={tag} />
                        ))}
                        {payment.tags.length > 3 && (
                            <span className="text-xs text-gray-500">+{payment.tags.length - 3}</span>
                        )}
                    </div>
                </td>
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {payment.matchStatus === 'unmatched' && onManualLink && (
                            <button
                                onClick={() => onManualLink(payment)}
                                className="app-btn-secondary text-xs px-3 py-1.5"
                            >
                                <LinkIcon className="w-3.5 h-3.5 mr-1" />
                                Vincular
                            </button>
                        )}
                        {onEditTags && (
                            <button
                                onClick={() => onEditTags(payment)}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                                title="Editar transação"
                            >
                                <Pencil className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </td>
            </tr>
            {isExpanded && hasDetails && (
                <tr className="bg-transparent">
                    <td colSpan={12} className="px-4 py-4">
                        <div className="space-y-3">
                            {payment.tinyOrderInfo && (
                                <div className="glass-panel p-3 rounded-lg">
                                    <h4 className="text-sm font-semibold mb-2 text-emerald-600 dark:text-emerald-400">
                                        Pedido Vinculado
                                    </h4>
                                    <div className="grid grid-cols-3 gap-4 text-sm">
                                        <div>
                                            <span className="text-gray-500 dark:text-gray-400">Número:</span>
                                            <p className="font-medium">{payment.tinyOrderInfo.numero_pedido}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 dark:text-gray-400">Cliente:</span>
                                            <p className="font-medium">{payment.tinyOrderInfo.cliente_nome}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 dark:text-gray-400">Valor:</span>
                                            <p className="font-medium">{formatBRL(payment.tinyOrderInfo.valor_total_pedido)}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {payment.matchStatus === 'multiple_entries' && (
                                <div className="glass-panel p-3 rounded-lg border-l-4 border-amber-500">
                                    <h4 className="text-sm font-semibold mb-2 text-amber-600 dark:text-amber-400">
                                        Múltiplas Movimentações
                                    </h4>
                                    <div className="space-y-2 text-sm">
                                        <p>
                                            <span className="text-gray-500 dark:text-gray-400">Saldo Líquido:</span>
                                            <span className="ml-2 font-semibold">{formatBRL(payment.netBalance || 0)}</span>
                                        </p>
                                        {payment.relatedPayments && payment.relatedPayments.length > 0 && (
                                            <p className="text-gray-600 dark:text-gray-400">
                                                Este pedido tem {payment.relatedPayments.length + 1} transações relacionadas
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {payment.transactionDescription && (
                                <div className="text-sm">
                                    <span className="text-gray-500 dark:text-gray-400">Descrição Completa:</span>
                                    <p className="mt-1 text-gray-700 dark:text-gray-300">{payment.transactionDescription}</p>
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

export default function PaymentPreviewTable({
    payments,
    marketplace,
    onManualLink,
    onEditTags,
}: PaymentPreviewTableProps) {
    const [filterStatus, setFilterStatus] = useState<'all' | 'linked' | 'unmatched' | 'multiple_entries'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const filteredPayments = payments.filter(p => {
        const matchesFilter = filterStatus === 'all' || p.matchStatus === filterStatus;
        const matchesSearch = searchTerm === '' ||
            p.marketplaceOrderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.transactionDescription?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-4">
                <input
                    type="text"
                    placeholder="Buscar por ID ou descrição..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="app-input flex-1 max-w-md"
                />
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
                </div>
            </div>

            {/* Table */}
            <div className="glass-card rounded-2xl overflow-hidden border border-white/20 dark:border-white/10">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="glass-panel border-b border-white/20 dark:border-white/10">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-8"></th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Data</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">ID Pedido</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Tipo</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Descrição</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Vlr. Pedido</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Vlr. Esperado</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Vlr. Recebido</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Diferença</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Tags</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Ações</th>
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
