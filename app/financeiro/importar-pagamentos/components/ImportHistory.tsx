'use client';

import React, { useState } from 'react';
import { History, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ImportHistoryItem {
    marketplace: string;
    dateRange: {
        start: string | null;
        end: string | null;
    };
    uploadedAt: string;
    paymentsCount: number;
}

export interface ImportHistoryProps {
    /** Array of history items */
    history: ImportHistoryItem[];
    /** Maximum items to show */
    maxItems?: number;
    /** Additional class names */
    className?: string;
}

export function ImportHistory({
    history,
    maxItems = 5,
    className,
}: ImportHistoryProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (history.length === 0) {
        return null;
    }

    const displayItems = history.slice(0, maxItems);

    const formatMarketplaceName = (name: string): string => {
        return name
            .replace('_', ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    const formatDateRange = (start: string | null, end: string | null): string => {
        if (!start || !end) return 'Período não definido';
        const startDate = new Date(start).toLocaleDateString('pt-BR');
        const endDate = new Date(end).toLocaleDateString('pt-BR');
        return `${startDate} - ${endDate}`;
    };

    return (
        <div className={cn('space-y-3', className)}>
            {/* Toggle button */}
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                    'import-history-toggle',
                    isExpanded && 'import-history-toggle-expanded'
                )}
            >
                <History className="w-4 h-4" />
                <span>
                    {isExpanded ? 'Ocultar histórico' : `Ver histórico (${history.length} importações)`}
                </span>
                <ChevronDown className={cn(
                    'w-4 h-4 import-history-toggle-icon',
                    isExpanded && 'rotate-180'
                )} />
            </button>

            {/* History list */}
            {isExpanded && (
                <div className="glass-panel glass-tint rounded-2xl border border-white/40 dark:border-white/10 p-4 space-y-2 animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 mb-3">
                        <History className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-semibold text-main">Histórico de Importações</h3>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {displayItems.map((item, index) => (
                            <div
                                key={index}
                                className="flex items-center justify-between p-3 rounded-lg bg-white/30 dark:bg-white/5"
                            >
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-main">
                                        {formatMarketplaceName(item.marketplace)}
                                    </p>
                                    <p className="text-xs text-muted">
                                        {formatDateRange(item.dateRange.start, item.dateRange.end)}
                                    </p>
                                </div>
                                <div className="text-right text-sm">
                                    <p className="font-semibold text-main">
                                        {item.paymentsCount} pagamentos
                                    </p>
                                    <p className="text-xs text-muted">
                                        {new Date(item.uploadedAt).toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {history.length > maxItems && (
                        <p className="text-xs text-muted text-center pt-2">
                            Mostrando {maxItems} de {history.length} importações
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

export default ImportHistory;
