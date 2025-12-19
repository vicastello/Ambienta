'use client';

import { useState } from 'react';
import { Search, Loader2, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TinyOrder {
    id: number;
    numero_pedido: string;
    cliente_nome: string;
    valor_total_pedido: number;
    data_pedido: string;
    marketplace?: string;
}

interface ManualLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    payment: {
        marketplaceOrderId: string;
        marketplace: string;
        netAmount: number;
        paymentDate: string | null;
    };
    sessionId?: string;
    onLinkSuccess?: () => void;
}

const formatBRL = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

export default function ManualLinkModal({
    isOpen,
    onClose,
    payment,
    sessionId,
    onLinkSuccess,
}: ManualLinkModalProps) {
    const [searchQuery, setSearchQuery] = useState(payment.marketplaceOrderId);
    const [isSearching, setIsSearching] = useState(false);
    const [isLinking, setIsLinking] = useState(false);
    const [foundOrders, setFoundOrders] = useState<TinyOrder[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [rateLimitRetry, setRateLimitRetry] = useState<number>(0);

    if (!isOpen) return null;

    const handleSearch = async () => {
        setIsSearching(true);
        setError(null);
        setFoundOrders([]);

        try {
            const response = await fetch('/api/financeiro/pagamentos/search-tiny-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: searchQuery,
                    marketplace: payment.marketplace,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 429) {
                    setRateLimitRetry(data.retryAfter || 5);
                    setError(`Limite de requisições atingido. Aguarde ${data.retryAfter || 5}s e tente novamente.`);

                    // Auto-retry after delay
                    const retryTimer = setInterval(() => {
                        setRateLimitRetry(prev => {
                            if (prev <= 1) {
                                clearInterval(retryTimer);
                                handleSearch(); // Retry automatically
                                return 0;
                            }
                            return prev - 1;
                        });
                    }, 1000);
                } else {
                    setError(data.error || 'Erro ao buscar pedido');
                }
                return;
            }

            setFoundOrders(data.orders || []);
            if (data.orders.length === 0) {
                setError('Nenhum pedido encontrado na Tiny com este ID');
            }
        } catch (err) {
            setError('Erro de conexão ao buscar pedido');
        } finally {
            setIsSearching(false);
        }
    };

    const handleLink = async (tinyOrderId: number) => {
        setIsLinking(true);
        setError(null);

        try {
            const response = await fetch('/api/financeiro/pagamentos/link-manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    marketplaceOrderId: payment.marketplaceOrderId,
                    marketplace: payment.marketplace,
                    tinyOrderId,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Erro ao vincular pedido');
                return;
            }

            // Success!
            onLinkSuccess?.();
            onClose();
        } catch (err) {
            setError('Erro de conexão ao vincular pedido');
        } finally {
            setIsLinking(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="glass-panel max-w-2xl w-full mx-4 rounded-xl shadow-2xl max-h-[80vh] overflow-y-auto">
                {/* Header */}
                <div className="border-b border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                        Vincular Manualmente
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Busque e vincule o pedido correspondente na Tiny
                    </p>
                </div>

                {/* Payment Info */}
                <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Pagamento a Vincular
                    </h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                            <span className="text-gray-500 dark:text-gray-400">ID:</span>
                            <p className="font-mono font-medium">{payment.marketplaceOrderId}</p>
                        </div>
                        <div>
                            <span className="text-gray-500 dark:text-gray-400">Valor:</span>
                            <p className="font-medium">{formatBRL(payment.netAmount)}</p>
                        </div>
                        <div>
                            <span className="text-gray-500 dark:text-gray-400">Marketplace:</span>
                            <p className="font-medium capitalize">{payment.marketplace.replace('_', ' ')}</p>
                        </div>
                    </div>
                </div>

                {/* Search */}
                <div className="p-6 space-y-4">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="ID do pedido ou nome do cliente..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !isSearching && handleSearch()}
                            className="app-input flex-1"
                            disabled={isSearching || rateLimitRetry > 0}
                        />
                        <button
                            onClick={handleSearch}
                            disabled={isSearching || !searchQuery.trim() || rateLimitRetry > 0}
                            className="app-btn-primary px-6"
                        >
                            {isSearching ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Search className="w-4 h-4 mr-2" />
                            )}
                            {rateLimitRetry > 0 ? `Aguarde ${rateLimitRetry}s` : 'Buscar'}
                        </button>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Results */}
                    {foundOrders.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Pedidos Encontrados ({foundOrders.length})
                            </h3>
                            {foundOrders.map((order) => (
                                <div
                                    key={order.id}
                                    className="glass-panel p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-center gap-3">
                                                <h4 className="font-semibold text-gray-900 dark:text-white">
                                                    Pedido #{order.numero_pedido}
                                                </h4>
                                                {order.marketplace && (
                                                    <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                                                        {order.marketplace}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                                <div>
                                                    <span className="text-gray-500 dark:text-gray-400">Cliente:</span>
                                                    <p className="font-medium">{order.cliente_nome}</p>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500 dark:text-gray-400">Valor:</span>
                                                    <p className="font-medium">{formatBRL(order.valor_total_pedido)}</p>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500 dark:text-gray-400">Data:</span>
                                                    <p className="font-medium">
                                                        {new Date(order.data_pedido).toLocaleDateString('pt-BR')}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleLink(order.id)}
                                            disabled={isLinking}
                                            className="app-btn-primary ml-4"
                                        >
                                            {isLinking ? (
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            ) : (
                                                <CheckCircle className="w-4 h-4 mr-2" />
                                            )}
                                            Vincular
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Helper Text */}
                    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                        <p>💡 <strong>Dica:</strong> Busque pelo ID do marketplace ou nome do cliente</p>
                        <p>⚡ Se encontrar erro 429 (limite de requisições), o sistema aguarda automaticamente e tenta novamente</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 dark:border-gray-700 p-6 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="app-btn-secondary"
                        disabled={isLinking}
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
}
