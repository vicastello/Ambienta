'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    X, Plus, Trash2, Edit2, GripVertical, Check, Loader2,
    Tag, ShoppingCart, Store, Briefcase, Building, Users,
    Megaphone, FileText, Truck, Package, Server, Percent,
    Laptop, UserCheck, PlusCircle, MinusCircle, TrendingUp, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Icon mapping
const ICON_MAP: Record<string, any> = {
    'tag': Tag,
    'shopping-cart': ShoppingCart,
    'store': Store,
    'briefcase': Briefcase,
    'building': Building,
    'users': Users,
    'megaphone': Megaphone,
    'file-text': FileText,
    'truck': Truck,
    'package': Package,
    'server': Server,
    'percent': Percent,
    'laptop': Laptop,
    'user-check': UserCheck,
    'plus-circle': PlusCircle,
    'minus-circle': MinusCircle,
    'trending-up': TrendingUp,
    'refresh-cw': RefreshCw,
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

const COLOR_OPTIONS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
    '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
    '#64748b', '#71717a',
];

type Category = {
    id: string;
    name: string;
    type: 'income' | 'expense' | 'both';
    color: string;
    icon: string;
    parent_id: string | null;
    is_system: boolean;
    is_active: boolean;
    sort_order: number;
};

type CategoryFormData = {
    name: string;
    type: 'income' | 'expense' | 'both';
    color: string;
    icon: string;
};

function CategoryForm({
    initialData,
    onSubmit,
    onCancel,
    isLoading,
}: {
    initialData?: Partial<CategoryFormData>;
    onSubmit: (data: CategoryFormData) => void;
    onCancel: () => void;
    isLoading: boolean;
}) {
    const [formData, setFormData] = useState<CategoryFormData>({
        name: initialData?.name || '',
        type: initialData?.type || 'expense',
        color: initialData?.color || '#6366f1',
        icon: initialData?.icon || 'tag',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) return;
        onSubmit(formData);
    };

    const IconComponent = ICON_MAP[formData.icon] || Tag;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nome *
                </label>
                <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nome da categoria"
                    className="app-input w-full"
                    required
                    autoFocus
                />
            </div>

            {/* Type */}
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tipo
                </label>
                <div className="flex gap-2">
                    {(['income', 'expense', 'both'] as const).map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setFormData({ ...formData, type: t })}
                            className={cn(
                                "flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all",
                                formData.type === t
                                    ? t === 'income'
                                        ? "bg-emerald-500/20 text-emerald-600 border-2 border-emerald-500/50"
                                        : t === 'expense'
                                            ? "bg-rose-500/20 text-rose-600 border-2 border-rose-500/50"
                                            : "bg-primary-500/20 text-primary-600 border-2 border-primary-500/50"
                                    : "glass-panel text-slate-500 border border-white/20"
                            )}
                        >
                            {t === 'income' ? 'Receita' : t === 'expense' ? 'Despesa' : 'Ambos'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Color */}
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Cor
                </label>
                <div className="flex flex-wrap gap-2">
                    {COLOR_OPTIONS.map((color) => (
                        <button
                            key={color}
                            type="button"
                            onClick={() => setFormData({ ...formData, color })}
                            className={cn(
                                "w-8 h-8 rounded-full transition-all",
                                formData.color === color && "ring-2 ring-offset-2 ring-slate-900 dark:ring-white"
                            )}
                            style={{ backgroundColor: color }}
                        />
                    ))}
                </div>
            </div>

            {/* Icon */}
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Ícone
                </label>
                <div className="flex flex-wrap gap-2">
                    {ICON_OPTIONS.slice(0, 12).map((iconName) => {
                        const Icon = ICON_MAP[iconName];
                        return (
                            <button
                                key={iconName}
                                type="button"
                                onClick={() => setFormData({ ...formData, icon: iconName })}
                                className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                                    formData.icon === iconName
                                        ? "bg-primary-500 text-white"
                                        : "glass-panel text-slate-500 hover:text-slate-700"
                                )}
                            >
                                <Icon className="w-5 h-5" />
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Preview */}
            <div className="p-3 rounded-xl glass-panel border border-white/20">
                <span className="text-xs text-slate-500 block mb-2">Preview:</span>
                <div className="flex items-center gap-2">
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${formData.color}20` }}
                    >
                        <IconComponent className="w-4 h-4" style={{ color: formData.color }} />
                    </div>
                    <span className="font-medium">{formData.name || 'Nome da categoria'}</span>
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 py-3 rounded-xl glass-panel border border-white/20 text-slate-600 font-medium hover:bg-white/20 transition-all"
                >
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={isLoading || !formData.name.trim()}
                    className="flex-1 py-3 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition-all disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Salvar'}
                </button>
            </div>
        </form>
    );
}

function CategoryCard({
    category,
    onEdit,
    onDelete,
    onToggle,
}: {
    category: Category;
    onEdit: () => void;
    onDelete: () => void;
    onToggle: () => void;
}) {
    const IconComponent = ICON_MAP[category.icon] || Tag;

    return (
        <div className={cn(
            "flex items-center gap-3 p-3 rounded-xl glass-panel border transition-all group",
            category.is_active
                ? "border-white/40 dark:border-white/10"
                : "border-white/20 dark:border-white/5 opacity-50"
        )}>
            <div className="cursor-grab text-slate-300 hover:text-slate-500">
                <GripVertical className="w-4 h-4" />
            </div>

            <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${category.color}20` }}
            >
                <IconComponent className="w-5 h-5" style={{ color: category.color }} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 dark:text-white truncate">
                        {category.name}
                    </span>
                    {category.is_system && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                            Sistema
                        </span>
                    )}
                </div>
                <span className={cn(
                    "text-xs",
                    category.type === 'income' ? 'text-emerald-600' :
                        category.type === 'expense' ? 'text-rose-600' : 'text-primary-600'
                )}>
                    {category.type === 'income' ? 'Receita' : category.type === 'expense' ? 'Despesa' : 'Ambos'}
                </span>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={onToggle}
                    className={cn(
                        "p-2 rounded-lg transition-colors",
                        category.is_active
                            ? "hover:bg-amber-500/20 text-amber-500"
                            : "hover:bg-emerald-500/20 text-emerald-500"
                    )}
                    title={category.is_active ? 'Desativar' : 'Ativar'}
                >
                    {category.is_active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                    onClick={onEdit}
                    className="p-2 rounded-lg hover:bg-primary-500/20 text-slate-400 hover:text-primary-500 transition-colors"
                    title="Editar"
                >
                    <Edit2 className="w-4 h-4" />
                </button>
                {!category.is_system && (
                    <button
                        onClick={onDelete}
                        className="p-2 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-colors"
                        title="Excluir"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}

export function CategoriesManager({ onClose }: { onClose?: () => void }) {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');

    const fetchCategories = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/financeiro/categories?activeOnly=false');
            const data = await res.json();
            setCategories(data.categories || []);
        } catch (err) {
            setError('Erro ao carregar categorias');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    const handleCreate = async (formData: CategoryFormData) => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/financeiro/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setIsAdding(false);
            fetchCategories();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleUpdate = async (id: string, formData: CategoryFormData) => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/financeiro/categories', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...formData }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setEditingId(null);
            fetchCategories();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (category: Category) => {
        try {
            const res = await fetch('/api/financeiro/categories', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: category.id, is_active: !category.is_active }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error);
            }
            fetchCategories();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleDelete = async (category: Category) => {
        if (!confirm(`Excluir a categoria "${category.name}"?`)) return;
        try {
            const res = await fetch(`/api/financeiro/categories?id=${category.id}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            fetchCategories();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const filteredCategories = categories.filter(c => {
        if (filterType === 'all') return true;
        return c.type === filterType || c.type === 'both';
    });

    const incomeCategories = filteredCategories.filter(c => c.type === 'income' || c.type === 'both');
    const expenseCategories = filteredCategories.filter(c => c.type === 'expense' || c.type === 'both');

    const editingCategory = editingId ? categories.find(c => c.id === editingId) : null;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Tag className="w-5 h-5 text-primary-500" />
                    Categorias
                </h3>
                <div className="flex items-center gap-2">
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value as any)}
                        className="text-sm rounded-lg border-slate-200 dark:border-white/10"
                    >
                        <option value="all">Todas</option>
                        <option value="income">Receitas</option>
                        <option value="expense">Despesas</option>
                    </select>
                </div>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-rose-600 text-sm">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                </div>
            ) : isAdding ? (
                <CategoryForm
                    onSubmit={handleCreate}
                    onCancel={() => setIsAdding(false)}
                    isLoading={saving}
                />
            ) : editingCategory ? (
                <CategoryForm
                    initialData={editingCategory}
                    onSubmit={(data) => handleUpdate(editingCategory.id, data)}
                    onCancel={() => setEditingId(null)}
                    isLoading={saving}
                />
            ) : (
                <>
                    {/* Add button */}
                    <button
                        onClick={() => setIsAdding(true)}
                        className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:border-primary-500 hover:text-primary-500 transition-colors flex items-center justify-center gap-2"
                    >
                        <Plus className="w-5 h-5" />
                        Nova Categoria
                    </button>

                    {/* Income Categories */}
                    {(filterType === 'all' || filterType === 'income') && incomeCategories.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1">
                                <TrendingUp className="w-4 h-4" />
                                Receitas ({incomeCategories.length})
                            </h4>
                            <div className="space-y-2">
                                {incomeCategories.map((cat) => (
                                    <CategoryCard
                                        key={cat.id}
                                        category={cat}
                                        onEdit={() => setEditingId(cat.id)}
                                        onDelete={() => handleDelete(cat)}
                                        onToggle={() => handleToggle(cat)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Expense Categories */}
                    {(filterType === 'all' || filterType === 'expense') && expenseCategories.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium text-rose-600 dark:text-rose-400 mb-2 flex items-center gap-1">
                                <MinusCircle className="w-4 h-4" />
                                Despesas ({expenseCategories.length})
                            </h4>
                            <div className="space-y-2">
                                {expenseCategories.map((cat) => (
                                    <CategoryCard
                                        key={cat.id}
                                        category={cat}
                                        onEdit={() => setEditingId(cat.id)}
                                        onDelete={() => handleDelete(cat)}
                                        onToggle={() => handleToggle(cat)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
