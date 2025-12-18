'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { Plus, Loader2, X, Tag } from 'lucide-react';
import { createManualEntry, CreateManualEntryData } from '../../actions';

const SUGGESTED_TAGS = ['Fixo', 'Variável', 'Urgente', 'Recorrente', 'Operacional', 'Pessoal'];

export function ManualEntryModal() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tagInput, setTagInput] = useState('');

    const [formData, setFormData] = useState<CreateManualEntryData>({
        type: 'expense',
        description: '',
        category: 'Custos Fixos',
        subcategory: '',
        amount: 0,
        due_date: new Date().toISOString().split('T')[0],
        competence_date: new Date().toISOString().split('T')[0],
        status: 'pending',
        tags: [],
    });

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
            await createManualEntry(formData);
            setOpen(false);
            // Reset form
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
            });
            setTagInput('');
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="app-btn-secondary inline-flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Novo Lançamento
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Novo Lançamento Manual</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    {/* Tipo */}
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            type="button"
                            className={`p-2 rounded-lg border text-sm font-medium transition-colors ${formData.type === 'income'
                                ? 'bg-emerald-100 border-emerald-500 text-emerald-700 dark:bg-emerald-900/30'
                                : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-white/5 dark:border-white/10'
                                }`}
                            onClick={() => setFormData({ ...formData, type: 'income' })}
                        >
                            Receita
                        </button>
                        <button
                            type="button"
                            className={`p-2 rounded-lg border text-sm font-medium transition-colors ${formData.type === 'expense'
                                ? 'bg-rose-100 border-rose-500 text-rose-700 dark:bg-rose-900/30'
                                : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-white/5 dark:border-white/10'
                                }`}
                            onClick={() => setFormData({ ...formData, type: 'expense' })}
                        >
                            Despesa
                        </button>
                    </div>

                    {/* Descrição */}
                    <div>
                        <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-300">
                            Descrição
                        </label>
                        <input
                            type="text"
                            required
                            className="w-full rounded-lg border-slate-200 dark:border-white/10 bg-transparent"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Ex: Aluguel, Luz, Retirada..."
                        />
                    </div>

                    {/* Valor */}
                    <div>
                        <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-300">
                            Valor (R$)
                        </label>
                        <input
                            type="number"
                            required
                            min="0.01"
                            step="0.01"
                            className="w-full rounded-lg border-slate-200 dark:border-white/10 bg-transparent"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-300">
                                Data Vencimento
                            </label>
                            <input
                                type="date"
                                required
                                className="w-full rounded-lg border-slate-200 dark:border-white/10 bg-transparent"
                                value={formData.due_date}
                                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-300">
                                Status
                            </label>
                            <select
                                className="w-full rounded-lg border-slate-200 dark:border-white/10 bg-transparent"
                                value={formData.status}
                                onChange={(e) =>
                                    setFormData({ ...formData, status: e.target.value as any })
                                }
                            >
                                <option value="pending">Pendente</option>
                                <option value="confirmed">Pago/Recebido</option>
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
                                    <button
                                        type="button"
                                        onClick={() => removeTag(tag)}
                                        className="hover:text-primary-900"
                                    >
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
                        {/* Sugestões */}
                        <div className="flex flex-wrap gap-1 mt-2">
                            {SUGGESTED_TAGS.filter(t => !formData.tags.includes(t)).slice(0, 4).map(tag => (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => addTag(tag)}
                                    className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                >
                                    + {tag}
                                </button>
                            ))}
                        </div>
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

