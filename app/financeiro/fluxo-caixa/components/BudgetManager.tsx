'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import {
    Wallet, Plus, Trash2, Calendar, Target, Loader2, AlertCircle,
    TrendingUp, TrendingDown, ArrowRight, Edit2, Save, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Budget = {
    id: string;
    name: string;
    description?: string;
    period_type: string;
    start_date: string;
    end_date: string;
    budget_type: string;
    target_value?: string;
    planned_amount: number;
    alert_threshold: number;
    is_active: boolean;
    actual_amount?: number;
    variance?: number;
    variance_percent?: number;
    status?: string;
};

const PERIOD_TYPES = [
    { value: 'monthly', label: 'Mensal' },
    { value: 'quarterly', label: 'Trimestral' },
    { value: 'yearly', label: 'Anual' },
];

const BUDGET_TYPES = [
    { value: 'total', label: 'Todas as despesas' },
    { value: 'category', label: 'Por categoria' },
    { value: 'cost_center', label: 'Por centro de custo' },
    { value: 'entity', label: 'Por fornecedor' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    on_track: { label: 'Normal', color: 'text-emerald-600', bg: 'bg-emerald-500' },
    warning: { label: 'Atenção', color: 'text-amber-600', bg: 'bg-amber-500' },
    over_budget: { label: 'Estourado', color: 'text-rose-600', bg: 'bg-rose-500' },
    under_budget: { label: 'Economia', color: 'text-blue-600', bg: 'bg-blue-500' },
};

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export function BudgetManager() {
    const [open, setOpen] = useState(false);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [periodType, setPeriodType] = useState('monthly');
    const [budgetType, setBudgetType] = useState('total');
    const [targetValue, setTargetValue] = useState('');
    const [plannedAmount, setPlannedAmount] = useState('');
    const [alertThreshold, setAlertThreshold] = useState('80');

    const fetchBudgets = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/financeiro/budgets?tracking=true');
            const data = await res.json();
            setBudgets(data.budgets || []);
        } catch (err) {
            console.error('Error fetching budgets:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) fetchBudgets();
    }, [open, fetchBudgets]);

    const resetForm = () => {
        setName('');
        setPeriodType('monthly');
        setBudgetType('total');
        setTargetValue('');
        setPlannedAmount('');
        setAlertThreshold('80');
        setCreating(false);
        setEditingId(null);
    };

    const getDefaultDates = () => {
        const now = new Date();
        let start: Date, end: Date;

        if (periodType === 'monthly') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        } else if (periodType === 'quarterly') {
            const quarter = Math.floor(now.getMonth() / 3);
            start = new Date(now.getFullYear(), quarter * 3, 1);
            end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
        } else {
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date(now.getFullYear(), 11, 31);
        }

        return {
            start_date: start.toISOString().split('T')[0],
            end_date: end.toISOString().split('T')[0],
        };
    };

    const handleSubmit = async () => {
        if (!name || !plannedAmount) {
            toast.error('Preencha nome e valor planejado');
            return;
        }

        const dates = getDefaultDates();

        try {
            const res = await fetch('/api/financeiro/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    period_type: periodType,
                    budget_type: budgetType,
                    target_value: targetValue || undefined,
                    planned_amount: parseFloat(plannedAmount),
                    alert_threshold: parseInt(alertThreshold),
                    ...dates,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast.success('Orçamento criado!');
            resetForm();
            fetchBudgets();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Erro ao criar');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir este orçamento?')) return;

        try {
            await fetch(`/api/financeiro/budgets?id=${id}`, { method: 'DELETE' });
            setBudgets(prev => prev.filter(b => b.id !== id));
            toast.success('Orçamento excluído');
        } catch (err) {
            toast.error('Erro ao excluir');
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="app-btn-secondary inline-flex items-center gap-2">
                    <Wallet className="w-4 h-4" />
                    Orçamentos
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-primary-500" />
                        Orçamentos
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                    {/* Create Form */}
                    {creating ? (
                        <div className="p-4 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-950/20 space-y-3">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Nome do orçamento..."
                                className="app-input w-full"
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <select
                                    value={periodType}
                                    onChange={(e) => setPeriodType(e.target.value)}
                                    className="app-input"
                                >
                                    {PERIOD_TYPES.map(p => (
                                        <option key={p.value} value={p.value}>{p.label}</option>
                                    ))}
                                </select>
                                <select
                                    value={budgetType}
                                    onChange={(e) => setBudgetType(e.target.value)}
                                    className="app-input"
                                >
                                    {BUDGET_TYPES.map(b => (
                                        <option key={b.value} value={b.value}>{b.label}</option>
                                    ))}
                                </select>
                            </div>
                            {budgetType !== 'total' && (
                                <input
                                    type="text"
                                    value={targetValue}
                                    onChange={(e) => setTargetValue(e.target.value)}
                                    placeholder={budgetType === 'category' ? 'Nome da categoria' :
                                        budgetType === 'cost_center' ? 'Centro de custo' : 'Nome do fornecedor'}
                                    className="app-input w-full"
                                />
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-slate-500">Valor Planejado</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={plannedAmount}
                                        onChange={(e) => setPlannedAmount(e.target.value)}
                                        placeholder="0,00"
                                        className="app-input w-full"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500">Alerta em (%)</label>
                                    <input
                                        type="number"
                                        min="50"
                                        max="100"
                                        value={alertThreshold}
                                        onChange={(e) => setAlertThreshold(e.target.value)}
                                        className="app-input w-full"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button onClick={resetForm} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                                    <X className="w-4 h-4" />
                                </button>
                                <button onClick={handleSubmit} className="app-btn-primary text-sm flex items-center gap-1">
                                    <Save className="w-4 h-4" />
                                    Salvar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setCreating(true)}
                            className="w-full p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 hover:border-primary-300 hover:text-primary-500 transition-colors flex items-center justify-center gap-2"
                        >
                            <Plus className="w-5 h-5" />
                            Novo Orçamento
                        </button>
                    )}

                    {/* Budgets List */}
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        </div>
                    ) : budgets.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>Nenhum orçamento cadastrado</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {budgets.map((budget) => {
                                const config = STATUS_CONFIG[budget.status || 'on_track'];
                                const percentUsed = budget.planned_amount > 0
                                    ? ((budget.actual_amount || 0) / budget.planned_amount) * 100
                                    : 0;

                                return (
                                    <div
                                        key={budget.id}
                                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <h4 className="font-medium">{budget.name}</h4>
                                                <p className="text-xs text-slate-400">
                                                    {PERIOD_TYPES.find(p => p.value === budget.period_type)?.label}
                                                    {budget.target_value && ` • ${budget.target_value}`}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={cn("text-xs font-medium px-2 py-1 rounded-full", config.color, `${config.bg}/10`)}>
                                                    {config.label}
                                                </span>
                                                <button
                                                    onClick={() => handleDelete(budget.id)}
                                                    className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-500"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="mb-3">
                                            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    className={cn("h-full rounded-full transition-all", config.bg)}
                                                    style={{ width: `${Math.min(percentUsed, 100)}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Amounts */}
                                        <div className="flex items-center justify-between text-sm">
                                            <div>
                                                <span className="text-slate-500">Gasto: </span>
                                                <span className="font-medium">{formatCurrency(budget.actual_amount || 0)}</span>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-slate-300" />
                                            <div>
                                                <span className="text-slate-500">Limite: </span>
                                                <span className="font-medium">{formatCurrency(budget.planned_amount)}</span>
                                            </div>
                                            <div className={cn("font-medium", config.color)}>
                                                {percentUsed.toFixed(0)}%
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
