'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ReadonlyURLSearchParams } from 'next/navigation';
import { listManualEntries, markEntryAsPaid, deleteManualEntry, updateManualEntry } from '../../actions';
import { Loader2, Trash2, CheckCircle2, Clock, Plus, X, ArrowUp, ArrowDown, ArrowUpDown, Edit2, Circle, Minus, CreditCard, Download, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTagColor, formatTagName } from '@/lib/tagColors';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EntryEditModal } from './EntryEditModal';

interface ManualEntry {
    id: string;
    description: string;
    category: string;
    subcategory?: string;
    due_date: string;
    competence_date: string;
    amount: number;
    type: 'income' | 'expense';
    status: 'pending' | 'confirmed' | 'overdue' | 'cancelled';
    entity_name?: string;
    entity_type?: string;
    tags?: string[];
    paid_date?: string;
    source?: 'manual' | 'import';
}

// Interface for daily grouped entries by category
interface GroupedEntry {
    date: string;                 // YYYY-MM-DD
    category: string;             // Categoria do agrupamento (ex: "Renda do Pedido", "Recarga de Ads")
    groupKey: string;             // Chave única: date|category
    totalAmount: number;          // Soma total (positivo ou negativo)
    type: 'income' | 'expense';   // Tipo do grupo
    entries: ManualEntry[];       // Entradas originais
    consolidatedStatus: 'confirmed' | 'pending' | 'overdue'; // Status consolidado
}

interface ManualEntriesTableProps {
    searchParams: ReadonlyURLSearchParams;
}

type SortField = 'description' | 'entity_name' | 'due_date' | 'amount' | 'status';
type SortDirection = 'asc' | 'desc';

const formatCurrency = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
    }
    return new Date(dateStr).toLocaleDateString('pt-BR');
};

// Enhanced status config matching ReceivablesTable
const getEnhancedStatus = (entry: ManualEntry) => {
    if (entry.status === 'confirmed') {
        return {
            label: 'Pago',
            bg: 'bg-emerald-100 dark:bg-emerald-900/30',
            text: 'text-emerald-700 dark:text-emerald-300',
            icon: CheckCircle2,
            iconColor: 'text-emerald-500'
        };
    }
    if (entry.status === 'overdue') {
        return {
            label: 'Atrasado',
            bg: 'bg-rose-100 dark:bg-rose-900/30',
            text: 'text-rose-700 dark:text-rose-300',
            icon: AlertTriangle,
            iconColor: 'text-rose-500'
        };
    }
    return {
        label: 'Pendente',
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-300',
        icon: Clock,
        iconColor: 'text-amber-500'
    };
};

// Sortable header component
function SortableHeader({
    label,
    field,
    sortField,
    sortDirection,
    onSort,
    align = 'left'
}: {
    label: string;
    field: SortField;
    sortField: SortField | null;
    sortDirection: SortDirection;
    onSort: (field: SortField) => void;
    align?: 'left' | 'right' | 'center';
}) {
    const isActive = sortField === field;

    return (
        <th
            className={cn(
                "py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none",
                "hover:bg-white/40 dark:hover:bg-white/5 transition-colors",
                align === 'right' && 'text-right',
                align === 'center' && 'text-center'
            )}
            onClick={() => onSort(field)}
        >
            <div className={cn(
                "flex items-center gap-1 group",
                align === 'right' && 'flex-row-reverse',
                align === 'center' && 'justify-center'
            )}>
                {label}
                {isActive ? (
                    sortDirection === 'asc'
                        ? <ArrowUp className="w-3.5 h-3.5 text-primary-500" />
                        : <ArrowDown className="w-3.5 h-3.5 text-primary-500" />
                ) : (
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100" />
                )}
            </div>
        </th>
    );
}

// Selection Action Bar Component - matching ReceivablesTable style
function SelectionActionBar({
    selectedEntries,
    onMarkAsPaid,
    onClearSelection,
    isProcessing,
}: {
    selectedEntries: ManualEntry[];
    onMarkAsPaid: () => void;
    onClearSelection: () => void;
    isProcessing: boolean;
}) {
    const totals = selectedEntries.reduce(
        (acc, entry) => {
            const value = entry.amount;
            acc.total += value;
            if (entry.status === 'confirmed') {
                acc.paidCount++;
                acc.paidTotal += value;
            } else if (entry.status === 'overdue') {
                acc.overdueCount++;
                acc.overdueTotal += value;
            } else {
                acc.pendingCount++;
                acc.pendingTotal += value;
            }
            return acc;
        },
        { total: 0, paidCount: 0, paidTotal: 0, pendingCount: 0, pendingTotal: 0, overdueCount: 0, overdueTotal: 0 }
    );

    const unpaidCount = totals.pendingCount + totals.overdueCount;

    return (
        <div className="sticky top-0 z-10 p-4 rounded-2xl glass-panel glass-tint border border-primary-500/20 backdrop-blur-md animate-in slide-in-from-top-2 duration-200">
            {/* Top row: Count and totals */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary-500" />
                    <span className="font-bold text-lg text-primary-700 dark:text-primary-300">
                        {selectedEntries.length}
                    </span>
                    <span className="text-sm text-primary-600 dark:text-primary-400">
                        selecionado{selectedEntries.length > 1 ? 's' : ''}
                    </span>
                    <span className="text-slate-400 mx-1">•</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(totals.total)}
                    </span>
                </div>

                {/* Status breakdown badges */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    {totals.pendingCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                            <Clock className="w-3.5 h-3.5" />
                            {totals.pendingCount} pendente{totals.pendingCount > 1 ? 's' : ''}:
                            <strong>{formatCurrency(totals.pendingTotal)}</strong>
                        </span>
                    )}
                    {totals.overdueCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {totals.overdueCount} atrasado{totals.overdueCount > 1 ? 's' : ''}:
                            <strong>{formatCurrency(totals.overdueTotal)}</strong>
                        </span>
                    )}
                    {totals.paidCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {totals.paidCount} pago{totals.paidCount > 1 ? 's' : ''}:
                            <strong>{formatCurrency(totals.paidTotal)}</strong>
                        </span>
                    )}
                </div>
            </div>

            {/* Bottom row: Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/20 dark:border-white/10">
                <button
                    onClick={onMarkAsPaid}
                    disabled={isProcessing || unpaidCount === 0}
                    className="app-btn-success inline-flex items-center gap-2"
                >
                    {isProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <CreditCard className="w-4 h-4" />
                    )}
                    Marcar como Pago {unpaidCount > 0 && `(${unpaidCount})`}
                </button>

                <button
                    onClick={onClearSelection}
                    className="p-2 rounded-lg hover:bg-white/40 dark:hover:bg-white/10 transition-colors"
                    title="Limpar seleção"
                >
                    <X className="w-4 h-4 text-slate-500" />
                </button>
            </div>
        </div>
    );
}

export function ManualEntriesTable({ searchParams }: ManualEntriesTableProps) {
    const [entries, setEntries] = useState<ManualEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);
    const [bulkProcessing, setBulkProcessing] = useState(false);
    const [tagInputId, setTagInputId] = useState<string | null>(null);
    const [newTagValue, setNewTagValue] = useState('');
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editingEntry, setEditingEntry] = useState<ManualEntry | null>(null);
    const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
    const [collapsed, setCollapsed] = useState(false);

    // Extract filters from URL
    const dataInicio = searchParams.get('dataInicio') || undefined;
    const dataFim = searchParams.get('dataFim') || undefined;
    const statusPagamento = (searchParams.get('statusPagamento') as 'todos' | 'pagos' | 'pendentes' | 'atrasados') || undefined;
    const search = searchParams.get('busca') || undefined;

    const fetchEntries = async () => {
        setLoading(true);
        try {
            const data = await listManualEntries({
                dataInicio,
                dataFim,
                statusPagamento,
                search
            });
            setEntries(data as ManualEntry[]);
        } catch (error) {
            console.error('Failed to load manual entries', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEntries();
        setSelectedIds(new Set());
    }, [dataInicio, dataFim, statusPagamento, search]);

    // Sort entries
    const sortedEntries = useMemo(() => {
        if (!sortField) return entries;

        return [...entries].sort((a, b) => {
            let aVal: any = a[sortField];
            let bVal: any = b[sortField];

            if (aVal == null) aVal = '';
            if (bVal == null) bVal = '';

            if (sortField === 'due_date') {
                aVal = new Date(aVal).getTime();
                bVal = new Date(bVal).getTime();
            }

            if (sortField === 'amount') {
                aVal = Number(aVal);
                bVal = Number(bVal);
            }

            if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [entries, sortField, sortDirection]);

    // Group entries by date + category
    const groupedEntries = useMemo(() => {
        const groups = new Map<string, GroupedEntry>();

        // Helper to extract category from entry
        const getEntryCategory = (entry: ManualEntry): string => {
            // Use subcategory if available
            if (entry.subcategory && entry.subcategory !== 'Importado') {
                return entry.subcategory;
            }

            // Extract from description patterns
            const desc = entry.description?.toLowerCase() || '';
            if (desc.includes('renda do pedido') || desc.includes('order income')) {
                return 'Renda do Pedido';
            }
            if (desc.includes('recarga') || desc.includes('ads') || desc.includes('publicidade')) {
                return 'Recarga de Ads';
            }
            if (desc.includes('frete') || desc.includes('envio') || desc.includes('shipping')) {
                return 'Frete';
            }
            if (desc.includes('reembolso') || desc.includes('estorno') || desc.includes('refund')) {
                return 'Reembolso';
            }
            if (desc.includes('comissão') || desc.includes('taxa') || desc.includes('commission') || desc.includes('fee')) {
                return 'Taxas e Comissões';
            }
            if (desc.includes('ajuste') || desc.includes('adjustment')) {
                return 'Ajustes';
            }

            // Fallback to category or generic
            return entry.category || 'Outros';
        };

        entries.forEach(entry => {
            // Extract date part (YYYY-MM-DD)
            const dateKey = entry.due_date?.split('T')[0] || entry.due_date;
            const category = getEntryCategory(entry);
            const groupKey = `${dateKey}|${category}`;

            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    date: dateKey,
                    category: category,
                    groupKey: groupKey,
                    totalAmount: 0,
                    type: entry.type,
                    entries: [],
                    consolidatedStatus: 'confirmed'
                });
            }

            const group = groups.get(groupKey)!;
            group.entries.push(entry);
            group.totalAmount += entry.amount;

            // Consolidated status: overdue > pending > confirmed
            if (entry.status === 'overdue') {
                group.consolidatedStatus = 'overdue';
            } else if (entry.status === 'pending' && group.consolidatedStatus !== 'overdue') {
                group.consolidatedStatus = 'pending';
            }
        });

        // Sort by date, then by category
        return Array.from(groups.values()).sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            if (dateA !== dateB) {
                if (sortField === 'due_date') {
                    return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
                }
                return dateA - dateB;
            }
            // Same date, sort by category
            return a.category.localeCompare(b.category);
        });
    }, [entries, sortField, sortDirection]);

    // Toggle date expansion
    const toggleDateExpansion = (date: string) => {
        setExpandedDates(prev => {
            const newSet = new Set(prev);
            if (newSet.has(date)) {
                newSet.delete(date);
            } else {
                newSet.add(date);
            }
            return newSet;
        });
    };

    const selectedEntries = useMemo(() =>
        entries.filter(e => selectedIds.has(e.id)),
        [entries, selectedIds]
    );

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Selection handlers
    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === sortedEntries.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(sortedEntries.map(e => e.id)));
        }
    };

    const isAllSelected = entries.length > 0 && selectedIds.size === entries.length;
    const isSomeSelected = selectedIds.size > 0 && selectedIds.size < entries.length;

    const handleMarkAsPaid = async (id: string) => {
        setProcessing(id);
        try {
            await markEntryAsPaid(id, new Date().toISOString().split('T')[0]);
            await fetchEntries();
        } catch {
            alert('Erro ao baixar.');
        } finally {
            setProcessing(null);
        }
    };

    const handleMarkAsPending = async (id: string) => {
        setProcessing(id);
        try {
            await updateManualEntry(id, { status: 'pending' });
            await fetchEntries();
        } catch {
            alert('Erro ao alterar status.');
        } finally {
            setProcessing(null);
        }
    };

    const handleDelete = async (id: string, description: string) => {
        if (!confirm(`Excluir "${description}"?`)) return;
        setProcessing(id);
        try {
            await deleteManualEntry(id);
            setEntries(prev => prev.filter(e => e.id !== id));
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
        } catch {
            alert('Erro ao excluir.');
        } finally {
            setProcessing(null);
        }
    };

    const handleBulkMarkAsPaid = async () => {
        setBulkProcessing(true);
        const ids = Array.from(selectedIds).filter(id => {
            const entry = entries.find(e => e.id === id);
            return entry && entry.status !== 'confirmed';
        });
        for (const id of ids) {
            await markEntryAsPaid(id, new Date().toISOString().split('T')[0]);
        }
        await fetchEntries();
        setSelectedIds(new Set());
        setBulkProcessing(false);
    };

    const addTag = async (id: string, tag: string) => {
        const trimmed = tag.trim();
        if (!trimmed) return;

        const entry = entries.find(e => e.id === id);
        if (!entry) return;

        const currentTags = entry.tags || [];
        if (currentTags.includes(trimmed)) return;

        const newTags = [...currentTags, trimmed];

        setEntries(prev => prev.map(e =>
            e.id === id ? { ...e, tags: newTags } : e
        ));
        setNewTagValue('');
        setTagInputId(null);

        try {
            await updateManualEntry(id, { tags: newTags } as any);
        } catch (error) {
            setEntries(prev => prev.map(e =>
                e.id === id ? { ...e, tags: currentTags } : e
            ));
        }
    };

    const removeTag = async (id: string, tag: string) => {
        const entry = entries.find(e => e.id === id);
        if (!entry) return;

        const currentTags = entry.tags || [];
        const newTags = currentTags.filter(t => t !== tag);

        setEntries(prev => prev.map(e =>
            e.id === id ? { ...e, tags: newTags } : e
        ));

        try {
            await updateManualEntry(id, { tags: newTags } as any);
        } catch (error) {
            setEntries(prev => prev.map(e =>
                e.id === id ? { ...e, tags: currentTags } : e
            ));
        }
    };

    if (loading) return <div className="p-4"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>;
    if (entries.length === 0) return null;

    return (
        <>
            <div className="space-y-4">
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={cn(
                        "flex items-center gap-3 w-full text-left py-3 px-4 rounded-2xl",
                        "glass-panel glass-tint",
                        "border border-white/40 dark:border-white/10",
                        "hover:bg-white/60 dark:hover:bg-white/5 transition-all duration-200",
                        "group"
                    )}
                >
                    <div className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-xl",
                        "bg-primary-100 dark:bg-primary-900/30",
                        "transition-transform duration-200",
                        !collapsed && "rotate-0",
                        collapsed && "-rotate-90"
                    )}>
                        <ChevronDown className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-main flex items-center gap-3">
                        Lançamentos
                        <span className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                            "bg-primary-100 dark:bg-primary-900/30",
                            "text-primary-700 dark:text-primary-300"
                        )}>
                            {entries.length}
                        </span>
                    </h3>
                    <span className="ml-auto text-xs text-muted">
                        {collapsed ? 'Clique para expandir' : 'Clique para minimizar'}
                    </span>
                </button>

                {!collapsed && (
                    <>
                        {/* Selection Action Bar */}
                        {selectedIds.size > 0 && (
                            <SelectionActionBar
                                selectedEntries={selectedEntries}
                                onMarkAsPaid={handleBulkMarkAsPaid}
                                onClearSelection={() => setSelectedIds(new Set())}
                                isProcessing={bulkProcessing}
                            />
                        )}

                        <div className="glass-panel glass-tint rounded-3xl border border-white/40 dark:border-white/10 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-white/50 dark:bg-black/20 border-b border-white/20 dark:border-white/10">
                                        <tr>
                                            <th className="py-4 px-4 w-12">
                                                <button
                                                    onClick={toggleSelectAll}
                                                    className="p-1 rounded hover:bg-white/40 dark:hover:bg-white/10 transition-colors"
                                                    title={isAllSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                                                >
                                                    {isAllSelected ? (
                                                        <CheckCircle2 className="w-4 h-4 text-primary-500" />
                                                    ) : isSomeSelected ? (
                                                        <div className="relative">
                                                            <Circle className="w-4 h-4 text-slate-400" />
                                                            <Minus className="w-2.5 h-2.5 text-primary-500 absolute top-[3px] left-[3px]" />
                                                        </div>
                                                    ) : (
                                                        <Circle className="w-4 h-4 text-slate-400" />
                                                    )}
                                                </button>
                                            </th>
                                            <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">Data</th>
                                            <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">Categoria</th>
                                            <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 text-center">Qtd</th>
                                            <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 text-right">Valor</th>
                                            <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10 dark:divide-white/5">
                                        {groupedEntries.map((group) => {
                                            const isExpanded = expandedDates.has(group.groupKey);
                                            const statusConfig = {
                                                confirmed: {
                                                    label: 'Pago',
                                                    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
                                                    text: 'text-emerald-700 dark:text-emerald-300',
                                                    icon: CheckCircle2,
                                                    iconColor: 'text-emerald-500'
                                                },
                                                pending: {
                                                    label: 'Pendente',
                                                    bg: 'bg-amber-100 dark:bg-amber-900/30',
                                                    text: 'text-amber-700 dark:text-amber-300',
                                                    icon: Clock,
                                                    iconColor: 'text-amber-500'
                                                },
                                                overdue: {
                                                    label: 'Atrasado',
                                                    bg: 'bg-rose-100 dark:bg-rose-900/30',
                                                    text: 'text-rose-700 dark:text-rose-300',
                                                    icon: AlertTriangle,
                                                    iconColor: 'text-rose-500'
                                                }
                                            };
                                            const status = statusConfig[group.consolidatedStatus];
                                            const StatusIcon = status.icon;

                                            // Check if any entries in this group are selected
                                            const groupEntryIds = group.entries.map(e => e.id);
                                            const selectedInGroup = groupEntryIds.filter(id => selectedIds.has(id)).length;
                                            const allGroupSelected = selectedInGroup === group.entries.length;
                                            const someGroupSelected = selectedInGroup > 0 && selectedInGroup < group.entries.length;

                                            const toggleGroupSelection = () => {
                                                setSelectedIds(prev => {
                                                    const newSet = new Set(prev);
                                                    if (allGroupSelected) {
                                                        groupEntryIds.forEach(id => newSet.delete(id));
                                                    } else {
                                                        groupEntryIds.forEach(id => newSet.add(id));
                                                    }
                                                    return newSet;
                                                });
                                            };

                                            return (
                                                <React.Fragment key={group.groupKey}>
                                                    {/* Grouped Row */}
                                                    <tr
                                                        onClick={() => toggleDateExpansion(group.groupKey)}
                                                        className={cn(
                                                            "hover:bg-white/40 dark:hover:bg-white/5 transition-colors cursor-pointer",
                                                            group.type === 'expense' && "bg-rose-50/30 dark:bg-rose-950/10",
                                                            group.type === 'income' && "bg-emerald-50/30 dark:bg-emerald-950/10",
                                                            group.consolidatedStatus === 'overdue' && "bg-rose-50/50 dark:bg-rose-950/20",
                                                            group.consolidatedStatus === 'pending' && "bg-amber-50/30 dark:bg-amber-950/10"
                                                        )}
                                                    >
                                                        <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); toggleGroupSelection(); }}
                                                                    className="p-1 rounded hover:bg-white/40 dark:hover:bg-white/10 transition-colors"
                                                                >
                                                                    {allGroupSelected ? (
                                                                        <CheckCircle2 className="w-4 h-4 text-primary-500" />
                                                                    ) : someGroupSelected ? (
                                                                        <div className="relative">
                                                                            <Circle className="w-4 h-4 text-slate-400" />
                                                                            <Minus className="w-2.5 h-2.5 text-primary-500 absolute top-[3px] left-[3px]" />
                                                                        </div>
                                                                    ) : (
                                                                        <Circle className="w-4 h-4 text-slate-400" />
                                                                    )}
                                                                </button>
                                                                {isExpanded ? (
                                                                    <ChevronDown className="w-4 h-4 text-slate-400" />
                                                                ) : (
                                                                    <ChevronRight className="w-4 h-4 text-slate-400" />
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-6 font-medium text-slate-700 dark:text-slate-200">
                                                            {formatDate(group.date)}
                                                        </td>
                                                        <td className="py-4 px-6 text-slate-600 dark:text-slate-400">
                                                            <span className="font-medium">{group.category}</span>
                                                        </td>
                                                        <td className="py-4 px-6 text-center text-slate-600 dark:text-slate-400">
                                                            {group.entries.length}
                                                        </td>
                                                        <td className={cn(
                                                            "py-4 px-6 text-right font-semibold",
                                                            group.type === 'income' ? "text-emerald-600" : "text-rose-600"
                                                        )}>
                                                            {group.type === 'income' ? '+' : '-'} {formatCurrency(group.totalAmount)}
                                                        </td>
                                                        <td className="py-4 px-6 text-center">
                                                            <span className={cn(
                                                                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium",
                                                                status.bg, status.text
                                                            )}>
                                                                <StatusIcon className={cn("w-3.5 h-3.5", status.iconColor)} />
                                                                {status.label}
                                                            </span>
                                                        </td>
                                                    </tr>

                                                    {/* Expanded Detail Rows */}
                                                    {isExpanded && group.entries.map((entry) => {
                                                        const entryStatus = getEnhancedStatus(entry);
                                                        const EntryStatusIcon = entryStatus.icon;
                                                        const isSelected = selectedIds.has(entry.id);

                                                        return (
                                                            <tr
                                                                key={entry.id}
                                                                onClick={() => setEditingEntry(entry)}
                                                                className={cn(
                                                                    "bg-slate-50/50 dark:bg-slate-900/30 hover:bg-white/60 dark:hover:bg-white/10 transition-colors cursor-pointer",
                                                                    isSelected && "bg-gradient-to-r from-primary-100/60 via-primary-50/40 to-transparent dark:from-primary-900/30 dark:via-primary-950/20 dark:to-transparent"
                                                                )}
                                                            >
                                                                <td className="py-3 px-4 pl-12" onClick={(e) => e.stopPropagation()}>
                                                                    <button
                                                                        onClick={() => toggleSelection(entry.id)}
                                                                        className="p-1 rounded hover:bg-white/40 dark:hover:bg-white/10 transition-colors"
                                                                    >
                                                                        {isSelected ? (
                                                                            <CheckCircle2 className="w-4 h-4 text-primary-500" />
                                                                        ) : (
                                                                            <Circle className="w-4 h-4 text-slate-400" />
                                                                        )}
                                                                    </button>
                                                                </td>
                                                                <td colSpan={2} className="py-3 px-6 text-sm text-slate-600 dark:text-slate-400">
                                                                    <div className="flex flex-col">
                                                                        <span className="font-medium text-slate-700 dark:text-slate-200">{entry.description}</span>
                                                                        <span className="text-xs text-slate-400">{entry.entity_name || entry.category}</span>
                                                                    </div>
                                                                </td>
                                                                <td colSpan={2} className={cn(
                                                                    "py-3 px-6 text-right font-medium",
                                                                    entry.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                                                                )}>
                                                                    {entry.type === 'income' ? '+' : '-'} {formatCurrency(entry.amount)}
                                                                </td>
                                                                <td className="py-3 px-6"></td>
                                                                <td className="py-3 px-6 text-center">
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <button
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                disabled={processing === entry.id}
                                                                                className={cn(
                                                                                    "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium cursor-pointer",
                                                                                    "hover:ring-2 hover:ring-primary-500/30 transition-all disabled:opacity-50",
                                                                                    entryStatus.bg, entryStatus.text
                                                                                )}
                                                                            >
                                                                                {processing === entry.id ? (
                                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                                ) : (
                                                                                    <EntryStatusIcon className={cn("w-3 h-3", entryStatus.iconColor)} />
                                                                                )}
                                                                                {entryStatus.label}
                                                                            </button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="center" className="min-w-[160px]">
                                                                            {entry.source === 'import' ? (
                                                                                <div className="px-2 py-1.5 text-xs text-center text-muted">
                                                                                    Importado automaticamente
                                                                                </div>
                                                                            ) : (
                                                                                <>
                                                                                    {entry.status !== 'confirmed' && (
                                                                                        <DropdownMenuItem
                                                                                            onClick={() => handleMarkAsPaid(entry.id)}
                                                                                            className="flex items-center gap-2 text-emerald-600"
                                                                                        >
                                                                                            <CheckCircle2 className="w-4 h-4" />
                                                                                            Marcar como Pago
                                                                                        </DropdownMenuItem>
                                                                                    )}
                                                                                    {entry.status === 'confirmed' && (
                                                                                        <DropdownMenuItem
                                                                                            onClick={() => handleMarkAsPending(entry.id)}
                                                                                            className="flex items-center gap-2 text-amber-600"
                                                                                        >
                                                                                            <Clock className="w-4 h-4" />
                                                                                            Marcar como Pendente
                                                                                        </DropdownMenuItem>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-white/50 dark:bg-black/20 border-t border-white/20 dark:border-white/10 font-bold text-slate-700 dark:text-slate-200">
                                        <tr>
                                            <td colSpan={4} className="py-4 px-6 text-right">Total</td>
                                            <td className="py-4 px-6 text-right">
                                                {(() => {
                                                    const totalIncome = groupedEntries.filter(g => g.type === 'income').reduce((acc, g) => acc + g.totalAmount, 0);
                                                    const totalExpense = groupedEntries.filter(g => g.type === 'expense').reduce((acc, g) => acc + g.totalAmount, 0);
                                                    const net = totalIncome - totalExpense;
                                                    return (
                                                        <span className={net >= 0 ? "text-emerald-600" : "text-rose-600"}>
                                                            {formatCurrency(net)}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Edit Modal */}
            <EntryEditModal
                entry={editingEntry as any}
                isOpen={!!editingEntry}
                onClose={() => setEditingEntry(null)}
                onSaved={() => {
                    setEditingEntry(null);
                    fetchEntries();
                }}
            />
        </>
    );
}
