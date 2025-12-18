'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import {
    X, Save, Loader2, Copy, Trash2, Ban, Tag, User, Building,
    Calendar, DollarSign, FileText, Clock
} from 'lucide-react';
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
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        <span>Editar Lançamento</span>
                        <span className={cn(
                            "text-sm px-2 py-0.5 rounded-full",
                            entry.type === 'income'
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-900/30"
                        )}>
                            {entry.type === 'income' ? 'Receita' : 'Despesa'}
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                    {/* Source info */}
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5" />
                        Origem: <span className="font-medium">{entry.source}</span>
                        {entry.source !== 'manual' && (
                            <span className="text-amber-600">(campos limitados)</span>
                        )}
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Descrição</label>
                        <input
                            type="text"
                            value={formData.description || ''}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            disabled={!isManual}
                            className="app-input w-full disabled:opacity-50"
                        />
                    </div>

                    {/* Amount and Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                <DollarSign className="w-3.5 h-3.5 inline mr-1" />
                                Valor
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={formData.amount || ''}
                                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                                disabled={!isManual}
                                className="app-input w-full disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Status</label>
                            <select
                                value={formData.status || 'pending'}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                className="app-input w-full"
                            >
                                {STATUS_OPTIONS.map(s => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                                Vencimento
                            </label>
                            <input
                                type="date"
                                value={formData.due_date || ''}
                                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                                className="app-input w-full"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Pagamento</label>
                            <input
                                type="date"
                                value={formData.paid_date || ''}
                                onChange={(e) => setFormData({ ...formData, paid_date: e.target.value })}
                                className="app-input w-full"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Competência</label>
                            <input
                                type="date"
                                value={formData.competence_date || ''}
                                onChange={(e) => setFormData({ ...formData, competence_date: e.target.value })}
                                className="app-input w-full"
                            />
                        </div>
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            <Tag className="w-3.5 h-3.5 inline mr-1" />
                            Categoria
                        </label>
                        <select
                            value={formData.category_id || ''}
                            onChange={(e) => {
                                const cat = categories.find(c => c.id === e.target.value);
                                setFormData({
                                    ...formData,
                                    category_id: e.target.value,
                                    category: cat?.name || formData.category,
                                });
                            }}
                            className="app-input w-full"
                        >
                            <option value="">Selecione...</option>
                            {filteredCategories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Entity */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium mb-1">
                                <User className="w-3.5 h-3.5 inline mr-1" />
                                Cliente/Fornecedor
                            </label>
                            <input
                                type="text"
                                value={formData.entity_name || ''}
                                onChange={(e) => setFormData({ ...formData, entity_name: e.target.value })}
                                placeholder="Nome..."
                                className="app-input w-full"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Tipo</label>
                            <select
                                value={formData.entity_type || ''}
                                onChange={(e) => setFormData({ ...formData, entity_type: e.target.value || undefined })}
                                className="app-input w-full"
                            >
                                <option value="">-</option>
                                {ENTITY_TYPES.map(et => (
                                    <option key={et.value} value={et.value}>{et.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Cost Center */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            <Building className="w-3.5 h-3.5 inline mr-1" />
                            Centro de Custo
                        </label>
                        <select
                            value={formData.cost_center || ''}
                            onChange={(e) => setFormData({ ...formData, cost_center: e.target.value })}
                            className="app-input w-full"
                        >
                            <option value="">-</option>
                            {COST_CENTERS.map(cc => (
                                <option key={cc} value={cc}>{cc}</option>
                            ))}
                        </select>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Tags</label>
                        <div className="flex flex-wrap items-center gap-1.5 p-2 min-h-[42px] rounded-lg border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-black/20">
                            {formData.tags?.map(tag => (
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
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addTag(tagInput);
                                    }
                                }}
                                placeholder="+ tag"
                                className="flex-1 min-w-[80px] bg-transparent border-0 focus:ring-0 text-sm p-0"
                            />
                        </div>
                    </div>

                    {/* Notes */}
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

                    {/* Metadata */}
                    <div className="text-xs text-slate-400 flex items-center gap-4 pt-2 border-t border-slate-100 dark:border-white/5">
                        <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Criado: {new Date(entry.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        <span>
                            Atualizado: {new Date(entry.updated_at).toLocaleDateString('pt-BR')}
                        </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-white/10">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleDuplicate}
                                disabled={loading || deleting}
                                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 transition-colors"
                                title="Duplicar"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={loading || deleting || formData.status === 'cancelled'}
                                className="p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-500 transition-colors disabled:opacity-30"
                                title="Cancelar"
                            >
                                <Ban className="w-4 h-4" />
                            </button>
                            {isManual && (
                                <button
                                    onClick={handleDelete}
                                    disabled={loading || deleting}
                                    className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-500 transition-colors"
                                    title="Excluir"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={loading || deleting}
                                className="px-4 py-2 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
