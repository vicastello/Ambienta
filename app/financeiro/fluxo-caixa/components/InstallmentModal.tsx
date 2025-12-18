'use client';

import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { CreditCard, Calendar, DollarSign, Loader2, AlertCircle, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

type Category = {
    id: string;
    name: string;
    type: string;
};

const FREQUENCIES = [
    { value: 'monthly', label: 'Mensal' },
    { value: 'biweekly', label: 'Quinzenal' },
    { value: 'weekly', label: 'Semanal' },
];

const ENTITY_TYPES = [
    { value: 'client', label: 'Cliente' },
    { value: 'supplier', label: 'Fornecedor' },
    { value: 'bank', label: 'Banco' },
    { value: 'other', label: 'Outro' },
];

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export function InstallmentModal({ open: externalOpen, onOpenChange: externalOnOpenChange }: { open?: boolean; onOpenChange?: (v: boolean) => void }) {
    const router = useRouter();
    const [internalOpen, setInternalOpen] = useState(false);

    // Use external state if provided, otherwise internal
    const open = externalOpen !== undefined ? externalOpen : internalOpen;
    const setOpen = externalOnOpenChange || setInternalOpen;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);

    // Form state
    const [type, setType] = useState<'income' | 'expense'>('expense');
    const [totalAmount, setTotalAmount] = useState('');
    const [description, setDescription] = useState('');
    const [totalInstallments, setTotalInstallments] = useState('12');
    const [firstDueDate, setFirstDueDate] = useState(() => {
        const date = new Date();
        date.setMonth(date.getMonth() + 1);
        return date.toISOString().split('T')[0];
    });
    const [frequency, setFrequency] = useState('monthly');
    const [categoryId, setCategoryId] = useState('');
    const [entityName, setEntityName] = useState('');
    const [entityType, setEntityType] = useState('');

    // Fetch categories
    useEffect(() => {
        if (open) {
            fetch('/api/financeiro/categories')
                .then(res => res.json())
                .then(data => setCategories(data.categories || []))
                .catch(() => console.error('Error loading categories'));
        }
    }, [open]);

    const installmentAmount = totalAmount && totalInstallments
        ? parseFloat(totalAmount) / parseInt(totalInstallments)
        : 0;

    const handleSubmit = useCallback(async () => {
        setError(null);

        if (!totalAmount || !description || !totalInstallments || !firstDueDate) {
            setError('Preencha todos os campos obrigatórios');
            return;
        }

        const amount = parseFloat(totalAmount);
        const installments = parseInt(totalInstallments);

        if (isNaN(amount) || amount <= 0) {
            setError('Valor total inválido');
            return;
        }

        if (isNaN(installments) || installments < 2) {
            setError('Mínimo de 2 parcelas');
            return;
        }

        setLoading(true);

        try {
            const selectedCategory = categories.find(c => c.id === categoryId);

            const res = await fetch('/api/financeiro/installments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    total_amount: amount,
                    description,
                    category: selectedCategory?.name,
                    category_id: categoryId || undefined,
                    entity_name: entityName || undefined,
                    entity_type: entityType || undefined,
                    total_installments: installments,
                    first_due_date: firstDueDate,
                    frequency,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast.success(`Parcelamento criado: ${installments}x de ${formatCurrency(data.plan.installment_amount)}`);

            // Reset form
            setTotalAmount('');
            setDescription('');
            setTotalInstallments('12');
            setCategoryId('');
            setEntityName('');
            setEntityType('');

            setOpen(false);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao criar parcelamento');
        } finally {
            setLoading(false);
        }
    }, [type, totalAmount, description, totalInstallments, firstDueDate, frequency, categoryId, entityName, entityType, categories, router]);

    const filteredCategories = categories.filter(c => c.type === type || c.type === 'both');

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {!externalOnOpenChange && (
                    <button className="app-btn-secondary inline-flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        Parcelamento
                    </button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-primary-500" />
                        Novo Parcelamento
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                    {/* Type Toggle */}
                    <div className="flex p-1 bg-slate-100 dark:bg-white/10 rounded-xl">
                        <button
                            onClick={() => setType('expense')}
                            className={cn(
                                "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                                type === 'expense'
                                    ? "bg-rose-500 text-white"
                                    : "text-slate-600 dark:text-slate-400 hover:bg-white/50"
                            )}
                        >
                            Despesa
                        </button>
                        <button
                            onClick={() => setType('income')}
                            className={cn(
                                "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                                type === 'income'
                                    ? "bg-emerald-500 text-white"
                                    : "text-slate-600 dark:text-slate-400 hover:bg-white/50"
                            )}
                        >
                            Receita
                        </button>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Descrição *</label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Ex: Compra de equipamento"
                            className="app-input w-full"
                        />
                    </div>

                    {/* Total Amount and Installments */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                <DollarSign className="w-3.5 h-3.5 inline mr-1" />
                                Valor Total *
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={totalAmount}
                                onChange={(e) => setTotalAmount(e.target.value)}
                                placeholder="0,00"
                                className="app-input w-full"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                <Hash className="w-3.5 h-3.5 inline mr-1" />
                                Parcelas *
                            </label>
                            <input
                                type="number"
                                min="2"
                                max="120"
                                value={totalInstallments}
                                onChange={(e) => setTotalInstallments(e.target.value)}
                                className="app-input w-full"
                            />
                        </div>
                    </div>

                    {/* Preview */}
                    {installmentAmount > 0 && (
                        <div className="p-3 rounded-xl bg-primary-50 dark:bg-primary-950/20 text-center">
                            <p className="text-sm text-slate-600 dark:text-slate-400">Valor da parcela:</p>
                            <p className="text-xl font-bold text-primary-600 dark:text-primary-400">
                                {totalInstallments}x de {formatCurrency(installmentAmount)}
                            </p>
                        </div>
                    )}

                    {/* First Due Date and Frequency */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                                1ª Parcela *
                            </label>
                            <input
                                type="date"
                                value={firstDueDate}
                                onChange={(e) => setFirstDueDate(e.target.value)}
                                className="app-input w-full"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Frequência</label>
                            <select
                                value={frequency}
                                onChange={(e) => setFrequency(e.target.value)}
                                className="app-input w-full"
                            >
                                {FREQUENCIES.map(f => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Categoria</label>
                        <select
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
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
                            <label className="block text-sm font-medium mb-1">Cliente/Fornecedor</label>
                            <input
                                type="text"
                                value={entityName}
                                onChange={(e) => setEntityName(e.target.value)}
                                placeholder="Nome..."
                                className="app-input w-full"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Tipo</label>
                            <select
                                value={entityType}
                                onChange={(e) => setEntityType(e.target.value)}
                                className="app-input w-full"
                            >
                                <option value="">-</option>
                                {ENTITY_TYPES.map(et => (
                                    <option key={et.value} value={et.value}>{et.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-rose-600 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            onClick={() => setOpen(false)}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="app-btn-primary flex items-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            Criar {totalInstallments}x
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
