'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import {
    Zap, Plus, Trash2, Play, Pause, Loader2, Check, ChevronDown,
    ArrowRight, Save, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Rule = {
    id: string;
    name: string;
    description?: string;
    trigger_event: string;
    conditions: Condition[];
    actions: Action[];
    match_type: string;
    is_enabled: boolean;
    priority: number;
    times_triggered: number;
    last_triggered_at?: string;
};

type Condition = {
    field: string;
    operator: string;
    value: string;
};

type Action = {
    action: string;
    value: string;
};

const TRIGGER_EVENTS = [
    { value: 'entry_created', label: 'Ao criar entrada' },
    { value: 'entry_updated', label: 'Ao atualizar entrada' },
    { value: 'reconciliation', label: 'Na conciliação' },
];

const FIELDS = [
    { value: 'description', label: 'Descrição' },
    { value: 'category', label: 'Categoria' },
    { value: 'type', label: 'Tipo' },
    { value: 'amount', label: 'Valor' },
    { value: 'entity_name', label: 'Entidade' },
];

const OPERATORS = [
    { value: 'icontains', label: 'Contém' },
    { value: 'equals', label: 'É igual a' },
    { value: 'not_equals', label: 'Não é igual a' },
    { value: 'starts_with', label: 'Começa com' },
    { value: 'greater_than', label: 'Maior que' },
    { value: 'less_than', label: 'Menor que' },
];

const ACTIONS = [
    { value: 'set_category', label: 'Definir categoria' },
    { value: 'add_tag', label: 'Adicionar tag' },
    { value: 'set_entity', label: 'Definir entidade' },
    { value: 'set_cost_center', label: 'Definir centro custo' },
];

export function AutomationRulesManager() {
    const [open, setOpen] = useState(false);
    const [rules, setRules] = useState<Rule[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [triggerEvent, setTriggerEvent] = useState('entry_created');
    const [conditions, setConditions] = useState<Condition[]>([{ field: 'description', operator: 'icontains', value: '' }]);
    const [actions, setActions] = useState<Action[]>([{ action: 'set_category', value: '' }]);
    const [matchType, setMatchType] = useState('all');

    const fetchRules = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/financeiro/automations?enabled=false');
            const data = await res.json();
            setRules(data.rules || []);
        } catch (err) {
            console.error('Error fetching rules:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) fetchRules();
    }, [open, fetchRules]);

    const resetForm = () => {
        setName('');
        setTriggerEvent('entry_created');
        setConditions([{ field: 'description', operator: 'icontains', value: '' }]);
        setActions([{ action: 'set_category', value: '' }]);
        setMatchType('all');
        setCreating(false);
    };

    const handleSubmit = async () => {
        if (!name || conditions.some(c => !c.value) || actions.some(a => !a.value)) {
            toast.error('Preencha todos os campos');
            return;
        }

        try {
            const res = await fetch('/api/financeiro/automations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    trigger_event: triggerEvent,
                    conditions,
                    actions,
                    match_type: matchType,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast.success('Regra criada!');
            resetForm();
            fetchRules();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Erro ao criar');
        }
    };

    const toggleRule = async (rule: Rule) => {
        try {
            await fetch('/api/financeiro/automations', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: rule.id, is_enabled: !rule.is_enabled }),
            });
            setRules(prev => prev.map(r =>
                r.id === rule.id ? { ...r, is_enabled: !r.is_enabled } : r
            ));
        } catch (err) {
            toast.error('Erro ao atualizar');
        }
    };

    const deleteRule = async (id: string) => {
        if (!confirm('Excluir esta regra?')) return;

        try {
            await fetch(`/api/financeiro/automations?id=${id}`, { method: 'DELETE' });
            setRules(prev => prev.filter(r => r.id !== id));
            toast.success('Regra excluída');
        } catch (err) {
            toast.error('Erro ao excluir');
        }
    };

    const addCondition = () => {
        setConditions(prev => [...prev, { field: 'description', operator: 'icontains', value: '' }]);
    };

    const addAction = () => {
        setActions(prev => [...prev, { action: 'add_tag', value: '' }]);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="app-btn-secondary inline-flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Automações
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-primary-500" />
                        Regras de Automação
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                    {/* Create Form */}
                    {creating ? (
                        <div className="p-4 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-950/20 space-y-4">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Nome da regra..."
                                className="app-input w-full"
                            />

                            <div className="flex gap-3">
                                <select
                                    value={triggerEvent}
                                    onChange={(e) => setTriggerEvent(e.target.value)}
                                    className="app-input flex-1"
                                >
                                    {TRIGGER_EVENTS.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                                <select
                                    value={matchType}
                                    onChange={(e) => setMatchType(e.target.value)}
                                    className="app-input w-32"
                                >
                                    <option value="all">Todas</option>
                                    <option value="any">Qualquer</option>
                                </select>
                            </div>

                            {/* Conditions */}
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-500">SE</label>
                                {conditions.map((cond, i) => (
                                    <div key={i} className="flex gap-2 items-center">
                                        <select
                                            value={cond.field}
                                            onChange={(e) => {
                                                const newConds = [...conditions];
                                                newConds[i].field = e.target.value;
                                                setConditions(newConds);
                                            }}
                                            className="app-input w-28"
                                        >
                                            {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                        </select>
                                        <select
                                            value={cond.operator}
                                            onChange={(e) => {
                                                const newConds = [...conditions];
                                                newConds[i].operator = e.target.value;
                                                setConditions(newConds);
                                            }}
                                            className="app-input w-28"
                                        >
                                            {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                        <input
                                            type="text"
                                            value={cond.value}
                                            onChange={(e) => {
                                                const newConds = [...conditions];
                                                newConds[i].value = e.target.value;
                                                setConditions(newConds);
                                            }}
                                            placeholder="Valor..."
                                            className="app-input flex-1"
                                        />
                                        {conditions.length > 1 && (
                                            <button onClick={() => setConditions(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-rose-500">
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button onClick={addCondition} className="text-xs text-primary-500 hover:underline">
                                    + Adicionar condição
                                </button>
                            </div>

                            {/* Actions */}
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-500">ENTÃO</label>
                                {actions.map((act, i) => (
                                    <div key={i} className="flex gap-2 items-center">
                                        <select
                                            value={act.action}
                                            onChange={(e) => {
                                                const newActs = [...actions];
                                                newActs[i].action = e.target.value;
                                                setActions(newActs);
                                            }}
                                            className="app-input w-40"
                                        >
                                            {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                        </select>
                                        <ArrowRight className="w-4 h-4 text-slate-300" />
                                        <input
                                            type="text"
                                            value={act.value}
                                            onChange={(e) => {
                                                const newActs = [...actions];
                                                newActs[i].value = e.target.value;
                                                setActions(newActs);
                                            }}
                                            placeholder="Valor..."
                                            className="app-input flex-1"
                                        />
                                    </div>
                                ))}
                                <button onClick={addAction} className="text-xs text-primary-500 hover:underline">
                                    + Adicionar ação
                                </button>
                            </div>

                            <div className="flex justify-end gap-2">
                                <button onClick={resetForm} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                                    Cancelar
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
                            Nova Regra
                        </button>
                    )}

                    {/* Rules List */}
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        </div>
                    ) : rules.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <Zap className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>Nenhuma regra cadastrada</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {rules.map((rule) => (
                                <div
                                    key={rule.id}
                                    className={cn(
                                        "p-3 rounded-xl border transition-all",
                                        rule.is_enabled
                                            ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                                            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => toggleRule(rule)}
                                                className={cn(
                                                    "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                                                    rule.is_enabled ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                                                )}
                                            >
                                                {rule.is_enabled ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                                            </button>
                                            <div>
                                                <p className="font-medium text-sm">{rule.name}</p>
                                                <p className="text-xs text-slate-400">
                                                    {TRIGGER_EVENTS.find(t => t.value === rule.trigger_event)?.label}
                                                    {rule.times_triggered > 0 && ` • ${rule.times_triggered}x executada`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
                                                className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded"
                                            >
                                                <ChevronDown className={cn("w-4 h-4 transition-transform", expandedId === rule.id && "rotate-180")} />
                                            </button>
                                            <button
                                                onClick={() => deleteRule(rule.id)}
                                                className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-500"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Details */}
                                    {expandedId === rule.id && (
                                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="font-medium mb-1">Condições ({rule.match_type === 'all' ? 'todas' : 'qualquer'}):</p>
                                                    {rule.conditions.map((c, i) => (
                                                        <p key={i} className="text-slate-500">{c.field} {c.operator} "{c.value}"</p>
                                                    ))}
                                                </div>
                                                <div>
                                                    <p className="font-medium mb-1">Ações:</p>
                                                    {rule.actions.map((a, i) => (
                                                        <p key={i} className="text-slate-500">{a.action} → "{a.value}"</p>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
