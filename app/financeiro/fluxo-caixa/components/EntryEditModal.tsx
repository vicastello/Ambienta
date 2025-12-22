'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { AppDatePicker } from '@/components/ui/AppDatePicker';
import { AppSelect } from '@/components/ui/AppSelect';
import { Trash2, Save, X, Loader2, Calendar, DollarSign, Tag, FileText, LayoutGrid, Building, User, Copy, Ban, AlertCircle } from 'lucide-react';
import { getTagColor, formatTagName } from '@/lib/tagColors';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type Category = {
    id: string;
    name: string;
    type: string;
    color: string;
};

type CashFlowEntry = {
    id: string;
    type: 'income' | 'expense';
    amount: number;
    description: string;
    category: string;
    category_id?: string;
    subcategory?: string;
    due_date: string;
    paid_date?: string;
    competence_date?: string;
    status: string;
    source: string;
    entity_name?: string;
    entity_type?: string;
    cost_center?: string;
    tags?: string[];
    notes?: string;
    created_at: string;
    updated_at: string;
};

const ENTITY_TYPES = [
    { value: 'client', label: 'Cliente' },
    { value: 'supplier', label: 'Fornecedor' },
    { value: 'employee', label: 'Funcionário' },
    { value: 'bank', label: 'Banco' },
    { value: 'government', label: 'Governo' },
    { value: 'other', label: 'Outro' },
];

const STATUS_OPTIONS = [
    { value: 'pending', label: 'Pendente', color: 'text-amber-600' },
    { value: 'confirmed', label: 'Confirmado', color: 'text-emerald-600' },
    { value: 'overdue', label: 'Atrasado', color: 'text-rose-600' },
    { value: 'cancelled', label: 'Cancelado', color: 'text-slate-400' },
];

const COST_CENTERS = [
    'Operações', 'Marketing', 'Tecnologia', 'RH', 'Administrativo', 'Comercial'
];

export function EntryEditModal({
    entry: initialEntry,
    entryId,
    isOpen,
    onClose,
    onSaved,
}: {
    entry?: CashFlowEntry | null;
    entryId?: string;
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void;
}) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [entry, setEntry] = useState<CashFlowEntry | null>(initialEntry || null);

    // Update local entry when prop changes
    useEffect(() => {
        if (initialEntry) setEntry(initialEntry);
    }, [initialEntry]);

    const [deleting, setDeleting] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [formData, setFormData] = useState<Partial<CashFlowEntry>>({});
    const [tagInput, setTagInput] = useState('');

    // Fetch entry if only ID is provided
    useEffect(() => {
        if (isOpen && !initialEntry && entryId) {
            setFetching(true);
            fetch(`/api/financeiro/fluxo-caixa/entries/${entryId}`)
                .then(res => {
                    if (!res.ok) throw new Error('Entry not found');
                    return res.json();
                })
                .then(data => {
                    setEntry(data);
                })
                .catch(err => {
                    console.error(err);
                    toast.error('Erro ao carregar lançamento');
                    onClose();
                })
                .finally(() => setFetching(false));
        }
    }, [isOpen, initialEntry, entryId, onClose]);

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

    // Load entry data into form
    useEffect(() => {
        if (entry && isOpen) {
            setFormData({
                ...entry,
                tags: entry.tags || [],
            });
            fetchCategories();
        }
    }, [entry, isOpen, fetchCategories]);

    const handleSave = async () => {
        if (!entry) return;
        setLoading(true);

        try {
            const res = await fetch(`/api/financeiro/fluxo-caixa/entries/${entry.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast.success('Lançamento atualizado');
            onClose();
            onSaved?.();
            router.refresh();
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar');
        } finally {
            setLoading(false);
        }
    };

    const handleDuplicate = async () => {
        if (!entry) return;
        setLoading(true);

        try {
            const res = await fetch(`/api/financeiro/fluxo-caixa/entries/${entry.id}`, {
                method: 'POST',
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast.success('Lançamento duplicado');
            onClose();
            onSaved?.();
            router.refresh();
        } catch (err: any) {
            toast.error(err.message || 'Erro ao duplicar');
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = async () => {
        if (!entry || !confirm('Cancelar este lançamento?')) return;
        setDeleting(true);

        try {
            const res = await fetch(`/api/financeiro/fluxo-caixa/entries/${entry.id}?mode=cancel`, {
                method: 'DELETE',
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast.success('Lançamento cancelado');
            onClose();
            onSaved?.();
            router.refresh();
        } catch (err: any) {
            toast.error(err.message || 'Erro ao cancelar');
        } finally {
            setDeleting(false);
        }
    };

    const handleDelete = async () => {
        if (!entry || !confirm('Excluir permanentemente este lançamento? Esta ação não pode ser desfeita.')) return;
        setDeleting(true);

        try {
            const res = await fetch(`/api/financeiro/fluxo-caixa/entries/${entry.id}?mode=delete`, {
                method: 'DELETE',
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast.success('Lançamento excluído');
            onClose();
            onSaved?.();
            router.refresh();
        } catch (err: any) {
            toast.error(err.message || 'Erro ao excluir');
        } finally {
            setDeleting(false);
        }
    };

    const addTag = (tag: string) => {
        const trimmed = tag.trim();
        if (trimmed && !formData.tags?.includes(trimmed)) {
            setFormData({ ...formData, tags: [...(formData.tags || []), trimmed] });
        }
        setTagInput('');
    };

    const removeTag = (tag: string) => {
        setFormData({ ...formData, tags: formData.tags?.filter(t => t !== tag) });
    };

    const filteredCategories = categories.filter(c =>
        c.type === formData.type || c.type === 'both'
    );

    if (!entry && !fetching) return null;
    if (fetching) {
        return (
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Carregando...</DialogTitle>
                    </DialogHeader>
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    // Safety check if fetching failed or entry is still null
    if (!entry) return null;

    const isManual = entry.source === 'manual';

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-visible glass-panel border-white/20 dark:border-white/10 shadow-2xl p-0 gap-0 backdrop-blur-xl">
                <DialogHeader className="p-6 pb-4 border-b border-white/10 dark:border-white/5">
                    <DialogTitle className="flex items-center gap-3 text-xl">
                        <span className={cn(
                            "text-sm px-3 py-1 rounded-full font-medium flex items-center gap-1.5 shadow-sm backdrop-blur-md",
                            entry.type === 'income'
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20"
                        )}>
                            <div className={cn("w-1.5 h-1.5 rounded-full", entry.type === 'income' ? "bg-emerald-500" : "bg-rose-500")} />
                            {entry.type === 'income' ? 'Receita' : 'Despesa'}
                        </span>
                        <span className="text-slate-800 dark:text-slate-100 font-semibold tracking-tight">Editar Lançamento</span>
                    </DialogTitle>
                </DialogHeader>

                <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)] bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-white/5 p-5 shadow-sm space-y-6 backdrop-blur-sm">
                        {/* Row 1: Description (full width) */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Descrição</label>
                            <input
                                type="text"
                                value={formData.description || ''}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                disabled={!isManual}
                                className={cn(
                                    "app-input w-full transition-all glass-card",
                                    !isManual && "opacity-70 border-dashed text-slate-500"
                                )}
                            />
                        </div>

                        {/* Row 2: Valor / Status / Vencimento / Pagamento */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                    <DollarSign className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
                                    Valor
                                </label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={formData.amount ? `R$ ${formData.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00'}
                                    onChange={(e) => {
                                        const value = e.target.value.replace(/[^\d,]/g, '').replace(',', '.');
                                        setFormData({ ...formData, amount: parseFloat(value) || 0 });
                                    }}
                                    disabled={!isManual}
                                    className={cn(
                                        "app-input w-full font-medium text-slate-900 dark:text-slate-100 glass-card",
                                        !isManual && "opacity-70 border-dashed text-slate-500"
                                    )}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Status</label>
                                <AppSelect
                                    value={formData.status || 'pending'}
                                    onChange={(v) => setFormData({ ...formData, status: v })}
                                    options={STATUS_OPTIONS.map(s => ({ value: s.value, label: s.label }))}
                                    className="glass-card"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                    <Calendar className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
                                    Vencimento
                                </label>
                                <AppDatePicker
                                    value={formData.due_date || ''}
                                    onChange={(v) => setFormData({ ...formData, due_date: v })}
                                    className="glass-card"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Pagamento</label>
                                <AppDatePicker
                                    value={formData.paid_date || ''}
                                    onChange={(v) => setFormData({ ...formData, paid_date: v })}
                                    className="glass-card"
                                />
                            </div>
                        </div>

                        {/* Row 3: Cliente/Fornecedor / Tipo / Centro de Custo */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                    <User className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
                                    Cliente/Fornecedor
                                </label>
                                <input
                                    type="text"
                                    value={formData.entity_name || ''}
                                    onChange={(e) => setFormData({ ...formData, entity_name: e.target.value })}
                                    placeholder="Nome..."
                                    className="app-input w-full glass-card"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tipo</label>
                                <AppSelect
                                    value={formData.entity_type || ''}
                                    onChange={(v) => setFormData({ ...formData, entity_type: v || undefined })}
                                    options={[{ value: '', label: '-' }, ...ENTITY_TYPES]}
                                    className="glass-card"
                                />
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                    <Building className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
                                    Centro de Custo
                                </label>
                                <AppSelect
                                    value={formData.cost_center || ''}
                                    onChange={(v) => setFormData({ ...formData, cost_center: v })}
                                    options={[{ value: '', label: '-' }, ...COST_CENTERS.map(cc => ({ value: cc, label: cc }))]}
                                    className="glass-card"
                                />
                            </div>
                        </div>

                        {/* Row 4: Categoria / Tags */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                    <Tag className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
                                    Categoria
                                </label>
                                <AppSelect
                                    value={formData.category_id || ''}
                                    onChange={(v) => {
                                        const cat = categories.find(c => c.id === v);
                                        setFormData({
                                            ...formData,
                                            category_id: v,
                                            category: cat?.name || formData.category,
                                        });
                                    }}
                                    options={[{ value: '', label: 'Selecione...' }, ...filteredCategories.map(cat => ({ value: cat.id, label: cat.name }))]}
                                    placeholder="Selecione..."
                                    className="glass-card"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tags</label>
                                <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl border border-white/20 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/50 min-h-[42px] focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500 transition-all">
                                    {formData.tags?.map(tag => {
                                        const colors = getTagColor(tag);
                                        return (
                                            <span
                                                key={tag}
                                                className={cn(
                                                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium",
                                                    colors.bg,
                                                    colors.text
                                                )}
                                            >
                                                {formatTagName(tag)}
                                                <button
                                                    type="button"
                                                    onClick={() => removeTag(tag)}
                                                    className="hover:opacity-70 rounded-full p-0.5 transition-colors"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        );
                                    })}
                                    <input
                                        type="text"
                                        value={tagInput}
                                        onChange={(e) => setTagInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addTag(tagInput);
                                            }
                                        }}
                                        placeholder={formData.tags?.length === 0 ? "Adicionar tags..." : ""}
                                        className="flex-1 min-w-[80px] bg-transparent border-0 focus:ring-0 text-sm p-1 placeholder:text-slate-400 focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Row 5: Observações */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Observações</label>
                            <textarea
                                value={formData.notes || ''}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                rows={3}
                                placeholder="Notas internas..."
                                className="app-input w-full resize-none p-3 glass-card"
                            />
                        </div>
                    </div> {/* End of inner container */}

                    {!isManual && (
                        <div className="glass-card bg-amber-500/5 border-amber-500/20 rounded-lg p-3 flex items-start gap-3">
                            <FileText className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-medium text-amber-700 dark:text-amber-400">Lançamento Importado</p>
                                <p className="text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                                    Esta entrada foi importada automaticamente (origem: <span className="font-semibold">{entry.source}</span>).
                                    Alguns campos como valor e descrição são protegidos para manter a integridade com o extrato.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50/50 dark:bg-black/20 border-t border-white/10 flex items-center justify-between gap-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                        {/* Meta info */}
                        <div className="hidden sm:flex flex-col text-xs text-slate-400 mr-4">
                            <span>Criado: {new Date(entry.created_at).toLocaleDateString('pt-BR')}</span>
                        </div>

                        <button
                            onClick={handleDuplicate}
                            disabled={loading || deleting}
                            className="p-2 rounded-lg hover:bg-white/50 dark:hover:bg-white/10 border border-transparent hover:border-white/20 text-slate-500 transition-all"
                            title="Duplicar"
                        >
                            <Copy className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleCancel}
                            disabled={loading || deleting || formData.status === 'cancelled'}
                            className="p-2 rounded-lg hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 text-slate-400 hover:text-amber-600 transition-all"
                            title="Cancelar Lançamento"
                        >
                            <Ban className="w-4 h-4" />
                        </button>
                        {isManual && (
                            <button
                                onClick={handleDelete}
                                disabled={loading || deleting}
                                className="p-2 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 text-slate-400 hover:text-rose-600 transition-all"
                                title="Excluir"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-white/10 border border-transparent hover:border-white/20 rounded-lg transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading || deleting}
                            className="px-6 py-2 text-sm font-medium bg-transparent border border-slate-300 dark:border-white/20 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 hover:border-slate-400 dark:hover:border-white/30 transition-all flex items-center gap-2 disabled:opacity-50 rounded-lg shadow-sm"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Salvar Alterações
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog >
    );
}
