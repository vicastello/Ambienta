'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    X, Plus, Repeat, Trash2, Edit2, ToggleLeft, ToggleRight,
    Calendar, DollarSign, Tag, Clock, ArrowDownCircle, ArrowUpCircle, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    listRecurringEntries,
    createRecurringEntry,
    deleteRecurringEntry,
    toggleRecurringEntry,
    type RecurringEntry,
    type CreateRecurringEntryData
} from '@/app/financeiro/recurringActions';

const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const CATEGORIES = [
    'Infraestrutura',
    'Folha de Pagamento',
    'Marketing',
    'Serviços',
    'Impostos',
    'Outros',
];

const FREQUENCY_LABELS: Record<string, string> = {
    weekly: 'Semanal',
    monthly: 'Mensal',
    yearly: 'Anual',
};

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function RecurringEntryForm({
    onSubmit,
    onCancel,
    initialData,
}: {
    onSubmit: (data: CreateRecurringEntryData) => Promise<void>;
    onCancel: () => void;
    initialData?: Partial<CreateRecurringEntryData>;
}) {
    const [formData, setFormData] = useState<CreateRecurringEntryData>({
        type: initialData?.type || 'expense',
        description: initialData?.description || '',
        amount: initialData?.amount || 0,
        category: initialData?.category || '',
        frequency: initialData?.frequency || 'monthly',
        day_of_month: initialData?.day_of_month || 5,
        day_of_week: initialData?.day_of_week || 1,
        entity_name: initialData?.entity_name || '',
        notes: initialData?.notes || '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.description.trim() || formData.amount <= 0) return;

        setIsSubmitting(true);
        try {
            await onSubmit(formData);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type Toggle */}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'expense' })}
                    className={cn(
                        "flex-1 py-2 rounded-xl font-medium transition-all",
                        formData.type === 'expense'
                            ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-2 border-rose-500/50"
                            : "glass-panel text-slate-500 border border-white/20"
                    )}
                >
                    <ArrowDownCircle className="w-4 h-4 inline mr-2" />
                    Despesa
                </button>
                <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'income' })}
                    className={cn(
                        "flex-1 py-2 rounded-xl font-medium transition-all",
                        formData.type === 'income'
                            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-500/50"
                            : "glass-panel text-slate-500 border border-white/20"
                    )}
                >
                    <ArrowUpCircle className="w-4 h-4 inline mr-2" />
                    Receita
                </button>
            </div>

            {/* Description */}
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Descrição *
                </label>
                <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Ex: Aluguel, Energia, Salários..."
                    className="app-input w-full"
                    required
                />
            </div>

            {/* Amount and Entity */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Valor *
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={formData.amount || ''}
                        onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                        placeholder="0,00"
                        className="app-input w-full"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Fornecedor/Cliente
                    </label>
                    <input
                        type="text"
                        value={formData.entity_name || ''}
                        onChange={(e) => setFormData({ ...formData, entity_name: e.target.value })}
                        placeholder="Opcional"
                        className="app-input w-full"
                    />
                </div>
            </div>

            {/* Category */}
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Categoria
                </label>
                <select
                    value={formData.category || ''}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="app-input w-full"
                >
                    <option value="">Selecione...</option>
                    {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
            </div>

            {/* Frequency */}
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Frequência
                </label>
                <div className="flex gap-2">
                    {(['monthly', 'weekly', 'yearly'] as const).map((freq) => (
                        <button
                            key={freq}
                            type="button"
                            onClick={() => setFormData({ ...formData, frequency: freq })}
                            className={cn(
                                "flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all",
                                formData.frequency === freq
                                    ? "bg-primary-500/20 text-primary-600 dark:text-primary-400 border-2 border-primary-500/50"
                                    : "glass-panel text-slate-500 border border-white/20"
                            )}
                        >
                            {FREQUENCY_LABELS[freq]}
                        </button>
                    ))}
                </div>
            </div>

            {/* Day Selection */}
            {formData.frequency === 'monthly' && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Dia do mês
                    </label>
                    <input
                        type="number"
                        min="1"
                        max="31"
                        value={formData.day_of_month || 5}
                        onChange={(e) => setFormData({ ...formData, day_of_month: parseInt(e.target.value) || 5 })}
                        className="app-input w-24"
                    />
                </div>
            )}

            {formData.frequency === 'weekly' && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Dia da semana
                    </label>
                    <div className="flex gap-1">
                        {DAY_NAMES.map((day, idx) => (
                            <button
                                key={day}
                                type="button"
                                onClick={() => setFormData({ ...formData, day_of_week: idx })}
                                className={cn(
                                    "w-10 h-10 rounded-full text-sm font-medium transition-all",
                                    formData.day_of_week === idx
                                        ? "bg-primary-500 text-white"
                                        : "glass-panel text-slate-500"
                                )}
                            >
                                {day}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Notes */}
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Observações
                </label>
                <textarea
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Notas adicionais..."
                    rows={2}
                    className="app-input w-full resize-none"
                />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 py-3 rounded-xl glass-panel border border-white/20 text-slate-600 dark:text-slate-300 font-medium hover:bg-white/20 transition-all"
                >
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting || !formData.description.trim() || formData.amount <= 0}
                    className="flex-1 py-3 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? (
                        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                        'Salvar'
                    )}
                </button>
            </div>
        </form>
    );
}

function RecurringEntryCard({
    entry,
    onToggle,
    onDelete
}: {
    entry: RecurringEntry;
    onToggle: () => void;
    onDelete: () => void;
}) {
    const isExpense = entry.type === 'expense';

    return (
        <div className={cn(
            "glass-panel rounded-2xl p-4 border transition-all",
            entry.is_active
                ? "border-white/40 dark:border-white/10"
                : "border-white/20 dark:border-white/5 opacity-50"
        )}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        {isExpense ? (
                            <ArrowDownCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        ) : (
                            <ArrowUpCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                        )}
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                            {entry.description}
                        </span>
                    </div>
                    <div className={cn(
                        "text-lg font-bold",
                        isExpense ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                    )}>
                        {formatCurrency(entry.amount)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/40 dark:bg-white/10">
                            <Repeat className="w-3 h-3" />
                            {FREQUENCY_LABELS[entry.frequency]}
                            {entry.frequency === 'monthly' && entry.day_of_month && ` (dia ${entry.day_of_month})`}
                            {entry.frequency === 'weekly' && entry.day_of_week !== null && ` (${DAY_NAMES[entry.day_of_week]})`}
                        </span>
                        {entry.category && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/40 dark:bg-white/10">
                                <Tag className="w-3 h-3" />
                                {entry.category}
                            </span>
                        )}
                        {entry.next_due_date && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400">
                                <Calendar className="w-3 h-3" />
                                Próx: {new Date(entry.next_due_date).toLocaleDateString('pt-BR')}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onToggle}
                        className="p-2 rounded-lg hover:bg-white/20 dark:hover:bg-white/5 transition-colors"
                        title={entry.is_active ? 'Desativar' : 'Ativar'}
                    >
                        {entry.is_active ? (
                            <ToggleRight className="w-5 h-5 text-emerald-500" />
                        ) : (
                            <ToggleLeft className="w-5 h-5 text-slate-400" />
                        )}
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-2 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-colors"
                        title="Excluir"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

export function RecurringEntriesModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [entries, setEntries] = useState<RecurringEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [isAdding, setIsAdding] = useState(false);

    const fetchEntries = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listRecurringEntries();
            setEntries(data);
        } catch {
            console.error('Erro ao carregar recorrências');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchEntries();
        }
    }, [isOpen, fetchEntries]);

    const handleCreate = async (data: CreateRecurringEntryData) => {
        await createRecurringEntry(data);
        setIsAdding(false);
        await fetchEntries();
    };

    const handleToggle = async (id: string, currentStatus: boolean) => {
        await toggleRecurringEntry(id, !currentStatus);
        await fetchEntries();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir esta recorrência?')) return;
        await deleteRecurringEntry(id);
        await fetchEntries();
    };

    return (
        <>
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="app-btn-secondary inline-flex items-center gap-2 whitespace-nowrap"
            >
                <Repeat className="w-4 h-4" />
                Recorrências
            </button>

            {/* Modal */}
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Modal Content */}
                    <div className="relative w-full max-w-lg max-h-[90vh] overflow-auto glass-panel glass-tint rounded-3xl border border-white/40 dark:border-white/10 shadow-2xl">
                        {/* Header */}
                        <div className="sticky top-0 z-10 flex items-center justify-between p-6 pb-4 border-b border-white/20 dark:border-white/10 bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-t-3xl">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Repeat className="w-5 h-5 text-primary-500" />
                                    Lançamentos Recorrentes
                                </h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Despesas e receitas fixas mensais
                                </p>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2 rounded-xl hover:bg-white/20 dark:hover:bg-white/5 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-4">
                            {isAdding ? (
                                <RecurringEntryForm
                                    onSubmit={handleCreate}
                                    onCancel={() => setIsAdding(false)}
                                />
                            ) : (
                                <>
                                    {/* Add Button */}
                                    <button
                                        onClick={() => setIsAdding(true)}
                                        className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:border-primary-500 hover:text-primary-500 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Plus className="w-5 h-5" />
                                        Nova Recorrência
                                    </button>

                                    {/* List */}
                                    {loading ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                                        </div>
                                    ) : entries.length === 0 ? (
                                        <div className="text-center py-8 text-slate-500">
                                            <Repeat className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                            <p>Nenhuma recorrência cadastrada</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {entries.map((entry) => (
                                                <RecurringEntryCard
                                                    key={entry.id}
                                                    entry={entry}
                                                    onToggle={() => handleToggle(entry.id, entry.is_active)}
                                                    onDelete={() => handleDelete(entry.id)}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {/* Summary */}
                                    {entries.length > 0 && (
                                        <div className="pt-4 border-t border-white/20 dark:border-white/10">
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div className="glass-panel rounded-xl p-3">
                                                    <div className="text-slate-500 mb-1">Total Despesas/mês</div>
                                                    <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
                                                        {formatCurrency(
                                                            entries
                                                                .filter(e => e.type === 'expense' && e.is_active)
                                                                .reduce((sum, e) => sum + e.amount, 0)
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="glass-panel rounded-xl p-3">
                                                    <div className="text-slate-500 mb-1">Total Receitas/mês</div>
                                                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                                                        {formatCurrency(
                                                            entries
                                                                .filter(e => e.type === 'income' && e.is_active)
                                                                .reduce((sum, e) => sum + e.amount, 0)
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
