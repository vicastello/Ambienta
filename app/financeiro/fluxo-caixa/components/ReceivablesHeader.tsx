'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import {
    Filter, Calendar as CalendarIcon, CheckCircle2, Clock, AlertTriangle, List,
    Tag, X, ChevronDown, Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppSelect } from '@/components/ui/AppSelect';
import { PeriodPicker } from './PeriodPicker';

const STATUS_OPTIONS = [
    { value: 'todos', label: 'Todos', icon: List, color: 'text-slate-500' },
    { value: 'pagos', label: 'Pagos', icon: CheckCircle2, color: 'text-emerald-500' },
    { value: 'pendentes', label: 'Pendentes', icon: Clock, color: 'text-amber-500' },
    { value: 'atrasados', label: 'Atrasados', icon: AlertTriangle, color: 'text-rose-500' },
];

const PERIOD_PRESETS = [
    { value: 'hoje', label: 'Hoje' },
    { value: 'semana', label: 'Esta semana' },
    { value: 'mes', label: 'Este mês' },
    { value: 'ultimos30', label: 'Últimos 30 dias' },
    { value: 'custom', label: 'Personalizado' },
];

type Category = {
    id: string;
    name: string;
    type: string;
    color: string;
};

export function ReceivablesHeader() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [categories, setCategories] = useState<Category[]>([]);

    // Current filter values
    const currentStatus = searchParams.get('statusPagamento') || 'todos';
    const currentMarketplace = searchParams.get('marketplace') || 'todos';
    const currentCategory = searchParams.get('categoria') || 'todos';
    const currentPeriod = searchParams.get('periodo') || '';
    const currentDateStart = searchParams.get('dataInicio') || '';
    const currentDateEnd = searchParams.get('dataFim') || '';
    const currentMinValue = searchParams.get('valorMin') || '';
    const currentMaxValue = searchParams.get('valorMax') || '';
    const currentSearch = searchParams.get('busca') || '';
    const [searchInput, setSearchInput] = useState(currentSearch);

    // Load categories
    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetch('/api/financeiro/categories');
            const data = await res.json();
            setCategories(data.categories || []);
        } catch {
            console.error('Error loading categories');
        }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    // Count active filters
    const activeFilterCount = [
        currentStatus !== 'todos',
        currentMarketplace !== 'todos',
        currentCategory !== 'todos',
        currentDateStart,
        currentDateEnd,
        currentMinValue,
        currentMaxValue,
    ].filter(Boolean).length;

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

    // Helper to format date in local timezone (YYYY-MM-DD)
    const formatLocalDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const applyPeriodPreset = (preset: string) => {
        const params = new URLSearchParams(searchParams.toString());
        const now = new Date();
        let start = '', end = '';

        if (preset === 'hoje') {
            start = end = formatLocalDate(now);
        } else if (preset === 'semana') {
            const dayOfWeek = now.getDay();
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - dayOfWeek);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            start = formatLocalDate(startOfWeek);
            end = formatLocalDate(endOfWeek);
        } else if (preset === 'mes') {
            start = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
            end = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        } else if (preset === 'ultimos30') {
            const thirtyDaysAgo = new Date(now);
            thirtyDaysAgo.setDate(now.getDate() - 30);
            start = formatLocalDate(thirtyDaysAgo);
            end = formatLocalDate(now);
        }

        if (start) params.set('dataInicio', start);
        else params.delete('dataInicio');
        if (end) params.set('dataFim', end);
        else params.delete('dataFim');
        params.set('periodo', preset);
        params.set('page', '1');
        router.push(`?${params.toString()}`);
    };

    const clearAllFilters = () => {
        router.push('?page=1');
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Top row: Title and Status Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Contas a Receber</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Gerencie pedidos e conferência de pagamentos
                    </p>
                </div>

                {/* Quick Status Filters */}
                <div className="flex items-center gap-1 p-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg rounded-xl border border-slate-200 dark:border-slate-800 relative z-30">
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
                                        ? "bg-[#009CA6] hover:bg-[#007982] text-white shadow-sm"
                                        : "bg-transparent border-0 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
            <div
                className="glass-panel glass-tint p-4 rounded-2xl border border-white/40 dark:border-white/10 relative z-40"
                style={{ overflow: 'visible', contain: 'none' }}
            >
                {/* Main filters row */}
                <div className="flex flex-wrap gap-3 items-end">
                    {/* Period Presets */}
                    <div className="space-y-1.5 min-w-[220px]">
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Período</label>
                        <PeriodPicker
                            startDate={currentDateStart || undefined}
                            endDate={currentDateEnd || undefined}
                            currentPreset={currentPeriod || 'custom'}
                            onPresetSelect={applyPeriodPreset}
                            onRangeChange={(start, end) => {
                                const params = new URLSearchParams(searchParams.toString());
                                params.set('periodo', 'custom');
                                if (start) params.set('dataInicio', start); else params.delete('dataInicio');
                                if (end) params.set('dataFim', end); else params.delete('dataFim');
                                params.set('page', '1');
                                router.push(`?${params.toString()}`);
                            }}
                        />
                    </div>

                    {/* Search Input */}
                    <div className="space-y-1.5 flex-1 min-w-[200px]">
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1 flex items-center gap-1">
                            <Search className="w-3 h-3" />
                            Buscar
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Cliente, pedido, descrição..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        updateFilter('busca', searchInput);
                                    }
                                }}
                                onBlur={() => updateFilter('busca', searchInput)}
                                className="app-input w-full pl-9 pr-8"
                            />
                            {searchInput && (
                                <button
                                    onClick={() => {
                                        setSearchInput('');
                                        updateFilter('busca', '');
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"
                                >
                                    <X className="w-3 h-3 text-slate-400" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Marketplace */}
                    <div className="space-y-1.5 min-w-[160px]">
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Marketplace</label>
                        <AppSelect
                            value={currentMarketplace}
                            onChange={(v) => updateFilter('marketplace', v)}
                            options={[
                                { value: 'todos', label: 'Todos' },
                                { value: 'magalu', label: 'Magalu' },
                                { value: 'mercado_livre', label: 'Mercado Livre' },
                                { value: 'shopee', label: 'Shopee' },
                            ]}
                        />
                    </div>

                    {/* Category */}
                    <div className="space-y-1.5 min-w-[160px]">
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1 flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            Categoria
                        </label>
                        <AppSelect
                            value={currentCategory}
                            onChange={(v) => updateFilter('categoria', v)}
                            options={[{ value: 'todos', label: 'Todas' }, ...categories.map(cat => ({ value: cat.name, label: cat.name }))]}
                        />
                    </div>



                    {/* Active filter count + clear */}
                    {activeFilterCount > 0 && (
                        <div className="flex items-center gap-2 ml-auto">
                            <span className="text-xs px-2 py-1 rounded-full bg-primary-500/10 text-primary-600 dark:text-primary-400 font-medium">
                                {activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''} ativo{activeFilterCount > 1 ? 's' : ''}
                            </span>
                            <button
                                onClick={clearAllFilters}
                                className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-500 transition-colors"
                                title="Limpar todos"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Advanced filters row */}

            </div>
        </div>
    );
}
