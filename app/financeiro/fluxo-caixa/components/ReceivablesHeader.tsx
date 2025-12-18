'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, Calendar as CalendarIcon, CheckCircle2, Clock, AlertTriangle, List } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
    { value: 'todos', label: 'Todos', icon: List, color: 'text-slate-500' },
    { value: 'pagos', label: 'Pagos', icon: CheckCircle2, color: 'text-emerald-500' },
    { value: 'pendentes', label: 'Pendentes', icon: Clock, color: 'text-amber-500' },
    { value: 'atrasados', label: 'Atrasados', icon: AlertTriangle, color: 'text-rose-500' },
];

export function ReceivablesHeader() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Status Filter
    const currentStatus = searchParams.get('statusPagamento') || 'todos';

    // Marketplace Filter
    const currentMarketplace = searchParams.get('marketplace') || 'todos';

    // Date Filters
    const currentDateStart = searchParams.get('dataInicio') || '';
    const currentDateEnd = searchParams.get('dataFim') || '';

    const updateFilter = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value && value !== 'todos') {
            params.set(key, value);
        } else {
            params.delete(key);
        }
        params.set('page', '1'); // Reset to page 1 on filter change
        router.push(`?${params.toString()}`);
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Contas a Receber</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Gerencie todos os pedidos e conferência de pagamentos
                    </p>
                </div>

                {/* Quick Status Filters */}
                <div className="flex items-center gap-1 p-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg rounded-xl border border-slate-200 dark:border-slate-800">
                    {STATUS_OPTIONS.map((status) => {
                        const Icon = status.icon;
                        const isActive = currentStatus === status.value;
                        return (
                            <button
                                key={status.value}
                                onClick={() => updateFilter('statusPagamento', status.value)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                                    isActive
                                        ? "bg-primary-500 text-white shadow-sm"
                                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                )}
                            >
                                <Icon className={cn("w-4 h-4", !isActive && status.color)} />
                                <span className="hidden sm:inline">{status.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Filters Bar */}
            <div className="glass-panel glass-tint p-4 rounded-2xl border border-white/40 dark:border-white/10 flex flex-wrap gap-4 items-end">

                {/* Marketplace select */}
                <div className="space-y-1.5 flex-1 min-w-[200px]">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Marketplace</label>
                    <div className="relative">
                        <select
                            value={currentMarketplace}
                            onChange={(e) => updateFilter('marketplace', e.target.value)}
                            className="w-full pl-3 pr-10 py-2.5 bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none"
                        >
                            <option value="todos">Todos os canais</option>
                            <option value="magalu">Magalu</option>
                            <option value="mercado_livre">Mercado Livre</option>
                            <option value="shopee">Shopee</option>
                        </select>
                        <Filter className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                {/* Date Start */}
                <div className="space-y-1.5 flex-1 min-w-[150px]">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">De</label>
                    <div className="relative">
                        <input
                            type="date"
                            value={currentDateStart}
                            onChange={(e) => updateFilter('dataInicio', e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                        />
                        <CalendarIcon className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                {/* Date End */}
                <div className="space-y-1.5 flex-1 min-w-[150px]">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Até</label>
                    <div className="relative">
                        <input
                            type="date"
                            value={currentDateEnd}
                            onChange={(e) => updateFilter('dataFim', e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                        />
                        <CalendarIcon className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                {/* Clear Filters */}
                {(currentMarketplace !== 'todos' || currentDateStart || currentDateEnd) && (
                    <button
                        onClick={() => {
                            router.push('?page=1');
                        }}
                        className="py-2.5 px-4 text-sm font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors mb-px"
                    >
                        Limpar
                    </button>
                )}
            </div>
        </div>
    );
}
