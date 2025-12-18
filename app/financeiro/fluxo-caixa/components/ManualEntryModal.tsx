'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { Plus, Loader2, X, Tag, User, Building, Repeat, ChevronDown, ChevronUp } from 'lucide-react';
import { createManualEntry, CreateManualEntryData } from '../../actions';
import { cn } from '@/lib/utils';

type Category = {
    id: string;
    name: string;
    type: 'income' | 'expense' | 'both';
    color: string;
    icon: string;
};

const SUGGESTED_TAGS = ['Fixo', 'Variável', 'Urgente', 'Operacional', 'Pessoal'];

const ENTITY_TYPES = [
    { value: 'client', label: 'Cliente', icon: User },
    { value: 'supplier', label: 'Fornecedor', icon: Building },
    { value: 'other', label: 'Outro', icon: User },
];


interface ManualEntryModalProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function ManualEntryModal({ open: externalOpen, onOpenChange: externalOnOpenChange }: ManualEntryModalProps) {
    const [internalOpen, setInternalOpen] = useState(false);

    // Use external state if provided, otherwise internal
    const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
    const setIsOpen = externalOnOpenChange || setInternalOpen;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tagInput, setTagInput] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loadingCategories, setLoadingCategories] = useState(false);

    // Recurrence state
    const [isRecurring, setIsRecurring] = useState(false);
    const [frequency, setFrequency] = useState<'monthly' | 'weekly' | 'yearly'>('monthly');
    const [dayOfMonth, setDayOfMonth] = useState(5);

    // Installment (Parcelamento) state
    const [isInstallment, setIsInstallment] = useState(false);
    const [installmentCount, setInstallmentCount] = useState(3);
    const [installmentInterval, setInstallmentInterval] = useState<'monthly' | 'weekly'>('monthly');

    // Entity autocomplete state
    const [entitySuggestions, setEntitySuggestions] = useState<{ name: string; type: string | null }[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const entityInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState<CreateManualEntryData & {
        entity_name?: string;
        entity_type?: string;
        category_id?: string;
        cost_center?: string;
    }>({
        type: 'expense',
        description: '',
        category: 'Custos Fixos',
        subcategory: '',
        amount: 0,
        due_date: new Date().toISOString().split('T')[0],
        competence_date: new Date().toISOString().split('T')[0],
        status: 'pending',
        tags: [],
        entity_name: '',
        entity_type: undefined,
        category_id: '',
        cost_center: '',
    });

    // Fetch categories when modal opens
    const fetchCategories = useCallback(async () => {
        setLoadingCategories(true);
        try {
            const res = await fetch(`/api/financeiro/categories?type=${formData.type}`);
            const data = await res.json();
            setCategories(data.categories || []);
        } catch {
            console.error('Error loading categories');
        } finally {
            setLoadingCategories(false);
        }
    }, [formData.type]);

    useEffect(() => {
        if (isOpen) {
            fetchCategories();
        }
    }, [isOpen, fetchCategories]);

    // Fetch entity suggestions with debounce
    useEffect(() => {
        const query = formData.entity_name?.trim() || '';
        if (query.length < 2) {
            setEntitySuggestions([]);
            return;
        }

        const timer = setTimeout(async () => {
            setLoadingSuggestions(true);
            try {
                const res = await fetch(`/api/financeiro/entities?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                setEntitySuggestions(data.suggestions || []);
            } catch {
                console.error('Error loading entity suggestions');
            } finally {
                setLoadingSuggestions(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [formData.entity_name]);

    const addTag = (tag: string) => {
        const trimmed = tag.trim();
        if (trimmed && !formData.tags.includes(trimmed)) {
            setFormData({ ...formData, tags: [...formData.tags, trimmed] });
        }
        setTagInput('');
    };

    const removeTag = (tag: string) => {
        setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
    };

    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag(tagInput);
        } else if (e.key === 'Backspace' && !tagInput && formData.tags.length > 0) {
            removeTag(formData.tags[formData.tags.length - 1]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            // Get category name from selected category_id
            const selectedCategory = categories.find(c => c.id === formData.category_id);
            const entryData = {
                ...formData,
                category: selectedCategory?.name || formData.category,
            };

            await createManualEntry(entryData);

            // If recurring, also create the recurring entry
            if (isRecurring) {
                await fetch('/api/financeiro/recurring-entries', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: formData.type,
                        description: formData.description,
                        amount: formData.amount,
                        category: selectedCategory?.name || formData.category,
                        frequency,
                        day_of_month: dayOfMonth,
                        entity_name: formData.entity_name,
                    }),
                });
            }

            setIsOpen(false);
            resetForm();
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar.');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            type: 'expense',
            description: '',
            category: 'Custos Fixos',
            subcategory: '',
            amount: 0,
            due_date: new Date().toISOString().split('T')[0],
            competence_date: new Date().toISOString().split('T')[0],
            status: 'pending',
            tags: [],
            entity_name: '',
            entity_type: undefined,
            category_id: '',
            cost_center: '',
        });
        setTagInput('');
        setIsRecurring(false);
        setShowAdvanced(false);
    };

    const filteredCategories = categories.filter(c =>
        c.type === formData.type || c.type === 'both'
    );

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {!externalOnOpenChange && (
                    <button className="app-btn-secondary inline-flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Novo Lançamento
                    </button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Novo Lançamento Manual</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    {/* Tipo */}
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            type="button"
                            className={cn(
                                "p-3 rounded-xl border-2 text-sm font-medium transition-all",
                                formData.type === 'income'
                                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/30'
                                    : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-white/5 dark:border-white/10'
                            )}
                            onClick={() => setFormData({ ...formData, type: 'income', category_id: '' })}
                        >
                            Receita
                        </button>
                        <button
                            type="button"
                            className={cn(
                                "p-3 rounded-xl border-2 text-sm font-medium transition-all",
                                formData.type === 'expense'
                                    ? 'bg-rose-50 border-rose-500 text-rose-700 dark:bg-rose-900/30'
                                    : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-white/5 dark:border-white/10'
                            )}
                            onClick={() => setFormData({ ...formData, type: 'expense', category_id: '' })}
                        >
                            Despesa
                        </button>
                    </div>

                    {/* Descrição */}
                    <div>
                        <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-300">
                            Descrição *
                        </label>
                        <input
                            type="text"
                            required
                            className="app-input w-full"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Ex: Aluguel, Luz, Venda..."
                        />
                    </div>

                    {/* Valor e Data */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-300">
                                Valor (R$) *
                            </label>
                            <input
                                type="number"
                                required
                                min="0.01"
                                step="0.01"
                                className="app-input w-full"
                                value={formData.amount || ''}
                                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-300">
                                Vencimento *
                            </label>
                            <input
                                type="date"
                                required
                                className="app-input w-full"
                                value={formData.due_date}
                                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Categoria */}
                    <div>
                        <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-300">
                            Categoria
                        </label>
                        <select
                            className="app-input w-full"
                            value={formData.category_id}
                            onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                            disabled={loadingCategories}
                        >
                            <option value="">Selecione...</option>
                            {filteredCategories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Cliente/Fornecedor */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2 relative">
                            <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-300">
                                <User className="w-3.5 h-3.5 inline mr-1" />
                                Cliente/Fornecedor
                            </label>
                            <input
                                ref={entityInputRef}
                                type="text"
                                className="app-input w-full"
                                value={formData.entity_name}
                                onChange={(e) => {
                                    setFormData({ ...formData, entity_name: e.target.value });
                                    setShowSuggestions(true);
                                }}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                placeholder="Digite para buscar..."
                                autoComplete="off"
                            />
                            {/* Autocomplete dropdown */}
                            {showSuggestions && entitySuggestions.length > 0 && (
                                <div className="absolute z-50 w-full mt-1 app-dropdown-content max-h-48 overflow-y-auto">
                                    {entitySuggestions.map((s, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            className="app-dropdown-item w-full text-left"
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                setFormData({
                                                    ...formData,
                                                    entity_name: s.name,
                                                    entity_type: (s.type as 'client' | 'supplier' | 'other' | undefined) || formData.entity_type
                                                });
                                                setShowSuggestions(false);
                                            }}
                                        >
                                            <User className="w-3.5 h-3.5 text-slate-400" />
                                            {s.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {loadingSuggestions && (
                                <div className="absolute right-3 top-9">
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-300">
                                Tipo
                            </label>
                            <select
                                className="app-input w-full"
                                value={formData.entity_type}
                                onChange={(e) => setFormData({ ...formData, entity_type: e.target.value as any || undefined })}
                            >
                                <option value="">-</option>
                                {ENTITY_TYPES.map((et) => (
                                    <option key={et.value} value={et.value}>{et.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Recorrência Toggle */}
                    <div className="p-3 rounded-xl glass-panel border border-white/20">
                        <label className="flex items-center justify-between cursor-pointer">
                            <span className="flex items-center gap-2 text-sm font-medium">
                                <Repeat className="w-4 h-4 text-primary-500" />
                                Tornar recorrente
                            </span>
                            <button
                                type="button"
                                onClick={() => setIsRecurring(!isRecurring)}
                                className={cn("app-toggle", isRecurring && "active")}
                                aria-pressed={isRecurring}
                            />
                        </label>

                        {isRecurring && (
                            <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Frequência</label>
                                    <select
                                        className="app-input w-full text-sm"
                                        value={frequency}
                                        onChange={(e) => setFrequency(e.target.value as any)}
                                    >
                                        <option value="monthly">Mensal</option>
                                        <option value="weekly">Semanal</option>
                                        <option value="yearly">Anual</option>
                                    </select>
                                </div>
                                {frequency === 'monthly' && (
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Dia do mês</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="31"
                                            className="app-input w-full text-sm"
                                            value={dayOfMonth}
                                            onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 5)}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Parcelamento Toggle */}
                    <div className={cn(
                        "p-3 rounded-xl glass-panel border border-white/20",
                        isRecurring && "opacity-50 pointer-events-none"
                    )}>
                        <label className="flex items-center justify-between cursor-pointer">
                            <span className="flex items-center gap-2 text-sm font-medium">
                                <svg className="w-4 h-4 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="4" width="18" height="16" rx="2" />
                                    <path d="M3 10h18" />
                                    <path d="M8 4v6" />
                                    <path d="M16 4v6" />
                                </svg>
                                Parcelar
                            </span>
                            <button
                                type="button"
                                onClick={() => !isRecurring && setIsInstallment(!isInstallment)}
                                className={cn("app-toggle", isInstallment && "active")}
                                aria-pressed={isInstallment}
                            />
                        </label>

                        {isInstallment && (
                            <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Nº de Parcelas</label>
                                    <input
                                        type="number"
                                        min="2"
                                        max="60"
                                        className="app-input w-full text-sm"
                                        value={installmentCount}
                                        onChange={(e) => setInstallmentCount(parseInt(e.target.value) || 3)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Intervalo</label>
                                    <select
                                        className="app-input w-full text-sm"
                                        value={installmentInterval}
                                        onChange={(e) => setInstallmentInterval(e.target.value as any)}
                                    >
                                        <option value="monthly">Mensal</option>
                                        <option value="weekly">Semanal</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Advanced Section Toggle */}
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                    >
                        {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {showAdvanced ? 'Menos opções' : 'Mais opções'}
                    </button>

                    {showAdvanced && (
                        <>
                            {/* Status */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-300">
                                        Status
                                    </label>
                                    <select
                                        className="app-input w-full"
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                    >
                                        <option value="pending">Pendente</option>
                                        <option value="confirmed">Pago/Recebido</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-300">
                                        Centro de Custo
                                    </label>
                                    <select
                                        className="app-input w-full"
                                        value={formData.cost_center}
                                        onChange={(e) => setFormData({ ...formData, cost_center: e.target.value })}
                                    >
                                        <option value="">-</option>
                                        <option value="Operações">Operações</option>
                                        <option value="Marketing">Marketing</option>
                                        <option value="Tecnologia">Tecnologia</option>
                                        <option value="RH">RH</option>
                                        <option value="Administrativo">Administrativo</option>
                                        <option value="Comercial">Comercial</option>
                                    </select>
                                </div>
                            </div>

                            {/* Tags */}
                            <div>
                                <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-300">
                                    <Tag className="w-3.5 h-3.5 inline mr-1" />
                                    Tags
                                </label>
                                <div className="flex flex-wrap items-center gap-1.5 p-2 min-h-[42px] rounded-lg border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-black/20">
                                    {formData.tags.map(tag => (
                                        <span
                                            key={tag}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium"
                                        >
                                            {tag}
                                            <button type="button" onClick={() => removeTag(tag)} className="hover:text-primary-900">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                    <input
                                        type="text"
                                        value={tagInput}
                                        onChange={(e) => setTagInput(e.target.value)}
                                        onKeyDown={handleTagKeyDown}
                                        placeholder={formData.tags.length === 0 ? "Digite e pressione Enter..." : ""}
                                        className="flex-1 min-w-[100px] bg-transparent border-0 focus:ring-0 text-sm p-0"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {SUGGESTED_TAGS.filter(t => !formData.tags.includes(t)).slice(0, 4).map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => addTag(tag)}
                                            className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-colors"
                                        >
                                            + {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {error && <p className="text-sm text-rose-500">{error}</p>}

                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="app-btn-primary flex items-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            Salvar
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
