'use client';

import { Tag as TagIcon, Calendar, DollarSign, FileText } from 'lucide-react';

type MarketplacePayment = {
    id: string;
    marketplace: string;
    payment_date: string;
    net_amount: number;
    gross_amount: number;
    fees: number;
    status: string;
    transaction_type?: string;
    transaction_description?: string;
    tags: string[];
    is_adjustment: boolean;
    is_refund: boolean;
    balance_after?: number;
};

interface PaymentTransactionsTabProps {
    orderId: number;
}

const formatBRL = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function PaymentTransactionsTab({ orderId }: PaymentTransactionsTabProps) {
    const [payments, setPayments] = React.useState<MarketplacePayment[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        fetchPayments();
    }, [orderId]);

    const fetchPayments = async () => {
        try {
            const response = await fetch(`/api/financeiro/pagamentos/by-order?orderId=${orderId}`);
            const data = await response.json();
            if (data.success) {
                setPayments(data.payments || []);
            }
        } catch (error) {
            console.error('Error fetching payments:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="text-center py-8 text-muted">Carregando transações...</div>;
    }

    if (payments.length === 0) {
        return (
            <div className="text-center py-8">
                <DollarSign className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-muted">Nenhuma transação de pagamento vinculada</p>
            </div>
        );
    }

    const totalNet = payments.reduce((sum, p) => sum + p.net_amount, 0);
    const totalGross = payments.reduce((sum, p) => sum + p.gross_amount, 0);
    const totalFees = payments.reduce((sum, p) => sum + p.fees, 0);
    const hasMultiple = payments.length > 1;

    return (
        <div className="space-y-4">
            {/* Summary */}
            {hasMultiple && (
                <div className="glass-panel p-4 rounded-lg border-l-4 border-amber-500">
                    <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-3">
                        ⚠️ Múltiplas Transações Detectadas
                    </h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                            <span className="text-muted">Valor Bruto Total:</span>
                            <p className="font-semibold text-main">{formatBRL(totalGross)}</p>
                        </div>
                        <div>
                            <span className="text-muted">Taxas Totais:</span>
                            <p className="font-semibold text-red-600 dark:text-red-400">-{formatBRL(totalFees)}</p>
                        </div>
                        <div>
                            <span className="text-muted">Valor Líquido Final:</span>
                            <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatBRL(totalNet)}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Transactions List */}
            <div className="space-y-3">
                {payments.map((payment, index) => (
                    <div
                        key={payment.id}
                        className={`glass-panel p-4 rounded-lg ${payment.is_adjustment || payment.is_refund
                            ? 'border-l-4 border-amber-500'
                            : 'border-l-4 border-emerald-500'
                            }`}
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded capitalize">
                                        {payment.marketplace.replace('_', ' ')}
                                    </span>
                                    {payment.is_refund && (
                                        <span className="px-2 py-1 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                                            Reembolso
                                        </span>
                                    )}
                                    {payment.is_adjustment && (
                                        <span className="px-2 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
                                            Ajuste
                                        </span>
                                    )}
                                    {hasMultiple && (
                                        <span className="px-2 py-1 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded">
                                            Transação {index + 1} de {payments.length}
                                        </span>
                                    )}
                                </div>
                                {payment.transaction_type && (
                                    <p className="text-sm font-medium text-main">{payment.transaction_type}</p>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-bold text-main">{formatBRL(payment.net_amount)}</p>
                                <p className="text-xs text-muted">Líquido</p>
                            </div>
                        </div>

                        {/* Description */}
                        {payment.transaction_description && (
                            <div className="mb-3 p-3 rounded-lg bg-white/50 dark:bg-white/5">
                                <div className="flex items-start gap-2">
                                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                    <p className="text-sm text-gray-700 dark:text-gray-300">
                                        {payment.transaction_description}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                            <div>
                                <span className="text-muted flex items-center gap-1 mb-1">
                                    <Calendar className="w-3 h-3" />
                                    Data
                                </span>
                                <p className="font-medium text-main">{formatDate(payment.payment_date)}</p>
                            </div>
                            <div>
                                <span className="text-muted">Valor Bruto</span>
                                <p className="font-medium text-main">{formatBRL(payment.gross_amount)}</p>
                            </div>
                            <div>
                                <span className="text-muted">Taxas</span>
                                <p className="font-medium text-red-600 dark:text-red-400">
                                    {payment.fees > 0 ? `-${formatBRL(payment.fees)}` : '-'}
                                </p>
                            </div>
                            <div>
                                <span className="text-muted">Status</span>
                                <p className="font-medium text-main">{payment.status}</p>
                            </div>
                        </div>

                        {/* Tags */}
                        {payment.tags && payment.tags.length > 0 && (
                            <div>
                                <span className="text-xs text-muted mb-2 block">Tags:</span>
                                <div className="flex flex-wrap gap-1">
                                    {payment.tags.map(tag => (
                                        <span
                                            key={tag}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 rounded-full text-xs"
                                        >
                                            <TagIcon className="w-3 h-3" />
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Balance After */}
                        {payment.balance_after !== undefined && payment.balance_after !== null && (
                            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                                <span className="text-xs text-muted">Saldo após transação:</span>
                                <p className="text-sm font-semibold text-main">{formatBRL(payment.balance_after)}</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
