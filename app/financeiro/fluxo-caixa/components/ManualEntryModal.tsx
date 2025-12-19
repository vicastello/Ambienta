'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { AppDatePicker } from '@/components/ui/AppDatePicker';
import { AppSelect } from '@/components/ui/AppSelect';
import { Plus, Loader2, X, Tag, User, Building, Repeat, ChevronDown, ChevronUp, DollarSign, Calendar } from 'lucide-react';
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
        paid_date?: string;
    }>({
        type: 'income',
        description: '',
        category: 'Custos Fixos',
        subcategory: '',
        amount: 0,
        due_date: new Date().toISOString().split('T')[0],
        competence_date: new Date().toISOString().split('T')[0],
        paid_date: '',
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
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-visible">
                <DialogHeader>
                    <DialogTitle>Novo Lançamento Manual</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    {/* Tipo Receita/Despesa */}
                    <div className="grid grid-cols-2 gap-3">
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

                    {/* Row 1: Descrição (full width) */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Descrição *</label>
                        <input
                            type="text"
                            required
                            className="app-input w-full"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Ex: Aluguel, Luz, Venda..."
                        />
                    </div>

                    {/* Row 2: Valor / Status / Vencimento / Pagamento (4 cols) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                <DollarSign className="w-3.5 h-3.5 inline mr-1 text-slate-500 dark:text-slate-400" />
                                Valor *
                            </label>
                            <input
                                type="text"
                                inputMode="decimal"
                                required
                                value={formData.amount ? `R$ ${formData.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00'}
                                onChange={(e) => {
                                    const value = e.target.value.replace(/[^\d,]/g, '').replace(',', '.');
                                    setFormData({ ...formData, amount: parseFloat(value) || 0 });
                                }}
                                className="app-input w-full"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Status</label>
                            <AppSelect
                                value={formData.status || 'pending'}
                                onChange={(v) => setFormData({ ...formData, status: v as any })}
                                options={[
                                    { value: 'pending', label: 'Pendente' },
                                    { value: 'confirmed', label: 'Pago/Recebido' },
                                ]}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                <Calendar className="w-3.5 h-3.5 inline mr-1 text-slate-500 dark:text-slate-400" />
                                Vencimento *
                            </label>
                            <AppDatePicker
                                value={formData.due_date}
                                onChange={(v) => setFormData({ ...formData, due_date: v })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Pagamento</label>
                            <AppDatePicker
                                value={formData.paid_date || ''}
                                onChange={(v) => setFormData({ ...formData, paid_date: v })}
                            />
                        </div>
                    </div>

                    {/* Row 3: Cliente/Fornecedor / Tipo / Categoria (3 cols) */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="relative">
                            <label className="block text-sm font-medium mb-1">
                                <User className="w-3.5 h-3.5 inline mr-1 text-slate-500 dark:text-slate-400" />
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
                                <div className="absolute z-50 w-full mt-1 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-white/10 shadow-xl max-h-48 overflow-y-auto">
                                    {entitySuggestions.map((s, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border-0 bg-transparent"
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
                            <label className="block text-sm font-medium mb-1">Tipo</label>
                            <AppSelect
                                value={formData.entity_type || ''}
                                onChange={(v) => setFormData({ ...formData, entity_type: v as any || undefined })}
                                options={[{ value: '', label: '-' }, ...ENTITY_TYPES.map(et => ({ value: et.value, label: et.label }))]}
                            />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm font-medium mb-1">
                                <Building className="w-3.5 h-3.5 inline mr-1 text-slate-500 dark:text-slate-400" />
                                Centro de Custo
                            </label>
                            <AppSelect
                                value={formData.cost_center || ''}
                                onChange={(v) => setFormData({ ...formData, cost_center: v })}
                                options={[
                                    { value: '', label: '-' },
                                    { value: 'Operações', label: 'Operações' },
                                    { value: 'Marketing', label: 'Marketing' },
                                    { value: 'Tecnologia', label: 'Tecnologia' },
                                    { value: 'RH', label: 'RH' },
                                    { value: 'Administrativo', label: 'Administrativo' },
                                    { value: 'Comercial', label: 'Comercial' },
                                ]}
                            />
                        </div>
                    </div>

                    {/* Row 4: Categoria / Tags */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                <Tag className="w-3.5 h-3.5 inline mr-1 text-slate-500 dark:text-slate-400" />
                                Categoria
                            </label>
                            <AppSelect
                                value={formData.category_id || ''}
                                onChange={(v) => setFormData({ ...formData, category_id: v })}
                                options={[{ value: '', label: 'Selecione...' }, ...filteredCategories.map(cat => ({ value: cat.id, label: cat.name }))]}
                                disabled={loadingCategories}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Tags</label>
                            <div className="flex flex-wrap items-center gap-1.5 py-[0.75rem] px-4 rounded-3xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-black/20">
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
                                    placeholder={formData.tags.length === 0 ? "+ tag" : ""}
                                    className="flex-1 min-w-[80px] bg-transparent border-0 focus:ring-0 text-sm p-0"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Row 5: Observações */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Observações</label>
                        <textarea
                            value={formData.notes || ''}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            rows={2}
                            placeholder="Notas internas..."
                            className="app-input w-full resize-none"
                        />
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
                                    <AppSelect
                                        value={frequency}
                                        onChange={(v) => setFrequency(v as any)}
                                        options={[
                                            { value: 'monthly', label: 'Mensal' },
                                            { value: 'weekly', label: 'Semanal' },
                                            { value: 'yearly', label: 'Anual' },
                                        ]}
                                    />
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
