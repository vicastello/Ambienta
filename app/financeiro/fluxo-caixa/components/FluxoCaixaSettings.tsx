'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import {
    Settings, Tag, Columns, Bell, Download, Store, Palette,
    X, Loader2, Check, RefreshCw, Plus, Trash2, Edit2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CategoriesManager } from './CategoriesManager';
import { toast } from 'sonner';

type Tab = 'categories' | 'tags' | 'columns' | 'marketplace' | 'notifications' | 'export';

const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'categories', label: 'Categorias', icon: Tag },
    { id: 'tags', label: 'Tags', icon: Palette },
    { id: 'columns', label: 'Colunas', icon: Columns },
    { id: 'marketplace', label: 'Marketplace', icon: Store },
    { id: 'notifications', label: 'Notificações', icon: Bell },
    { id: 'export', label: 'Exportação', icon: Download },
];

type Preferences = {
    visible_columns: string[];
    notification_cooldown_hours: number;
    rows_per_page: number;
    show_categories: boolean;
    show_entities: boolean;
    show_cost_centers: boolean;
    export_format: string;
};

const DEFAULT_COLUMNS = [
    { id: 'numero_pedido', label: 'Nº Pedido', default: true },
    { id: 'data_pedido', label: 'Data', default: true },
    { id: 'cliente', label: 'Cliente', default: true },
    { id: 'entity_name', label: 'Entidade', default: false },
    { id: 'category', label: 'Categoria', default: false },
    { id: 'canal', label: 'Canal', default: true },
    { id: 'valor', label: 'Valor', default: true },
    { id: 'status_pagamento', label: 'Status', default: true },
    { id: 'vencimento_estimado', label: 'Vencimento', default: true },
    { id: 'tags', label: 'Tags', default: false },
    { id: 'cost_center', label: 'Centro de Custo', default: false },
];

const MARKETPLACE_RULES = [
    { id: 'shopee', label: 'Shopee', defaultDays: 7 },
    { id: 'mercado_livre', label: 'Mercado Livre', defaultDays: 14 },
    { id: 'magalu', label: 'Magalu', defaultDays: 30 },
    { id: 'outros', label: 'Outros', defaultDays: 0 },
];

function ColumnsTab({
    preferences,
    onChange,
}: {
    preferences: Preferences;
    onChange: (key: keyof Preferences, value: any) => void;
}) {
    const toggleColumn = (columnId: string) => {
        const current = preferences.visible_columns || DEFAULT_COLUMNS.filter(c => c.default).map(c => c.id);
        const updated = current.includes(columnId)
            ? current.filter(c => c !== columnId)
            : [...current, columnId];
        onChange('visible_columns', updated);
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Escolha quais colunas exibir na tabela de lançamentos:
            </p>

            <div className="space-y-2">
                {DEFAULT_COLUMNS.map((col) => {
                    const isVisible = (preferences.visible_columns || DEFAULT_COLUMNS.filter(c => c.default).map(c => c.id))
                        .includes(col.id);
                    return (
                        <label
                            key={col.id}
                            className={cn(
                                "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all",
                                isVisible
                                    ? "glass-panel border border-primary-500/30"
                                    : "glass-panel border border-white/20 opacity-60"
                            )}
                        >
                            <input
                                type="checkbox"
                                checked={isVisible}
                                onChange={() => toggleColumn(col.id)}
                                className="w-4 h-4 rounded text-primary-500"
                            />
                            <span className="flex-1 font-medium">{col.label}</span>
                            {col.default && (
                                <span className="text-xs text-slate-400">padrão</span>
                            )}
                        </label>
                    );
                })}
            </div>

            <div className="pt-4 border-t border-white/10">
                <label className="block text-sm font-medium mb-2">Linhas por página</label>
                <select
                    value={preferences.rows_per_page || 50}
                    onChange={(e) => onChange('rows_per_page', parseInt(e.target.value))}
                    className="app-input w-full"
                >
                    <option value={25}>25 linhas</option>
                    <option value={50}>50 linhas</option>
                    <option value={100}>100 linhas</option>
                    <option value={200}>200 linhas</option>
                </select>
            </div>
        </div>
    );
}

function MarketplaceTab() {
    const [rules, setRules] = useState(MARKETPLACE_RULES);

    const updateDays = (id: string, days: number) => {
        setRules(rules.map(r => r.id === id ? { ...r, defaultDays: days } : r));
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Configure os prazos de recebimento por canal de venda (D+X):
            </p>

            <div className="space-y-3">
                {rules.map((rule) => (
                    <div
                        key={rule.id}
                        className="flex items-center justify-between p-3 rounded-xl glass-panel border border-white/20"
                    >
                        <span className="font-medium">{rule.label}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-500">D +</span>
                            <input
                                type="number"
                                min="0"
                                max="90"
                                value={rule.defaultDays}
                                onChange={(e) => updateDays(rule.id, parseInt(e.target.value) || 0)}
                                className="w-16 text-center app-input"
                            />
                            <span className="text-sm text-slate-500">dias</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function NotificationsTab({
    preferences,
    onChange,
}: {
    preferences: Preferences;
    onChange: (key: keyof Preferences, value: any) => void;
}) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Configure as notificações de vencimentos e alertas:
            </p>

            <div className="space-y-3">
                <div className="p-4 rounded-xl glass-panel border border-white/20">
                    <label className="block text-sm font-medium mb-2">
                        Cooldown entre notificações
                    </label>
                    <select
                        value={preferences.notification_cooldown_hours || 4}
                        onChange={(e) => onChange('notification_cooldown_hours', parseInt(e.target.value))}
                        className="app-input w-full"
                    >
                        <option value={1}>1 hora</option>
                        <option value={2}>2 horas</option>
                        <option value={4}>4 horas</option>
                        <option value={8}>8 horas</option>
                        <option value={24}>24 horas</option>
                    </select>
                    <p className="text-xs text-slate-400 mt-2">
                        Tempo mínimo entre toasts de notificação para não incomodar
                    </p>
                </div>

                <div className="p-4 rounded-xl glass-panel border border-white/20">
                    <label className="block text-sm font-medium mb-3">
                        Tipos de alerta
                    </label>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" defaultChecked className="rounded text-primary-500" />
                            <span className="text-sm">Pedidos atrasados</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" defaultChecked className="rounded text-primary-500" />
                            <span className="text-sm">Vencimentos hoje</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" defaultChecked className="rounded text-primary-500" />
                            <span className="text-sm">Vencimentos esta semana</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="rounded text-primary-500" />
                            <span className="text-sm">Saldo projetado negativo</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ExportTab({
    preferences,
    onChange,
}: {
    preferences: Preferences;
    onChange: (key: keyof Preferences, value: any) => void;
}) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Configure o formato padrão de exportação:
            </p>

            <div className="grid grid-cols-3 gap-3">
                {['csv', 'xlsx', 'pdf'].map((format) => (
                    <button
                        key={format}
                        onClick={() => onChange('export_format', format)}
                        className={cn(
                            "py-4 rounded-xl font-medium transition-all uppercase",
                            preferences.export_format === format
                                ? "bg-primary-500 text-white"
                                : "glass-panel border border-white/20 text-slate-500"
                        )}
                    >
                        {format}
                    </button>
                ))}
            </div>

            <div className="pt-4 border-t border-white/10 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-primary-500" />
                    <span className="text-sm">Incluir cabeçalho com filtros aplicados</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-primary-500" />
                    <span className="text-sm">Incluir sumário de totais</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded text-primary-500" />
                    <span className="text-sm">Exportar apenas selecionados (se houver)</span>
                </label>
            </div>
        </div>
    );
}

// Tags Tab - inline implementation
const TAG_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
    '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#64748b'
];

interface AvailableTag {
    id: string;
    name: string;
    color: string;
    usage_count: number;
}

function TagsTab() {
    const [tags, setTags] = useState<AvailableTag[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('');

    const fetchTags = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/financeiro/tags');
            const data = await res.json();
            setTags(data.tags || []);
        } catch (error) {
            toast.error('Erro ao carregar tags');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTags();
    }, []);

    const handleCreate = async () => {
        if (!newTagName.trim()) return;
        setCreating(true);
        try {
            const res = await fetch('/api/financeiro/tags/manage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newTagName.trim(), color: newTagColor })
            });
            if (!res.ok) throw new Error('Failed');
            toast.success('Tag criada');
            setNewTagName('');
            setNewTagColor(TAG_COLORS[0]);
            fetchTags();
        } catch {
            toast.error('Erro ao criar tag');
        } finally {
            setCreating(false);
        }
    };

    const handleUpdate = async (id: string) => {
        if (!editName.trim()) return;
        try {
            const res = await fetch('/api/financeiro/tags/manage', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name: editName.trim(), color: editColor })
            });
            if (!res.ok) throw new Error('Failed');
            toast.success('Tag atualizada');
            setEditingId(null);
            fetchTags();
        } catch {
            toast.error('Erro ao atualizar tag');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Excluir "${name}"? Será removida de todos os pedidos.`)) return;
        try {
            const res = await fetch(`/api/financeiro/tags/manage?id=${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed');
            toast.success('Tag excluída');
            fetchTags();
        } catch {
            toast.error('Erro ao excluir tag');
        }
    };

    const startEdit = (tag: AvailableTag) => {
        setEditingId(tag.id);
        setEditName(tag.name);
        setEditColor(tag.color);
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Gerencie as tags disponíveis para categorizar pedidos:
            </p>

            {/* Create New Tag */}
            <div className="p-4 rounded-xl glass-panel border border-white/20 space-y-3">
                <label className="block text-sm font-medium">Nova Tag</label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        className="app-input flex-1"
                        placeholder="Nome da tag..."
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    />
                    <button
                        onClick={handleCreate}
                        disabled={creating || !newTagName.trim()}
                        className="app-btn-primary px-3"
                    >
                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                    {TAG_COLORS.map((color) => (
                        <button
                            key={color}
                            onClick={() => setNewTagColor(color)}
                            className={cn(
                                "w-6 h-6 rounded-full transition-all",
                                newTagColor === color && "ring-2 ring-offset-2 ring-primary-500"
                            )}
                            style={{ backgroundColor: color }}
                        />
                    ))}
                </div>
            </div>

            {/* Tags List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                    </div>
                ) : tags.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">Nenhuma tag criada ainda</div>
                ) : (
                    tags.map((tag) => (
                        <div key={tag.id} className="flex items-center gap-3 p-3 rounded-xl glass-panel border border-white/20 group">
                            {editingId === tag.id ? (
                                <>
                                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: editColor }} />
                                    <input
                                        type="text"
                                        className="app-input flex-1 text-sm py-1"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        autoFocus
                                    />
                                    <div className="flex gap-1">
                                        {TAG_COLORS.slice(0, 5).map((c) => (
                                            <button
                                                key={c}
                                                onClick={() => setEditColor(c)}
                                                className={cn("w-4 h-4 rounded-full", editColor === c && "ring-1 ring-white")}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                    <button onClick={() => handleUpdate(tag.id)} className="p-1 rounded hover:bg-emerald-500/20 text-emerald-500">
                                        <Check className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-slate-500/20 text-slate-400">
                                        <X className="w-4 h-4" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                                    <span className="flex-1 text-sm font-medium">{tag.name}</span>
                                    <span className="text-xs text-slate-400">{tag.usage_count} uso{tag.usage_count !== 1 ? 's' : ''}</span>
                                    <button onClick={() => startEdit(tag)} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-500/20 text-slate-400 transition-opacity">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(tag.id, tag.name)} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 text-rose-500 transition-opacity">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export function FluxoCaixaSettings() {
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('categories');
    const [preferences, setPreferences] = useState<Preferences>({
        visible_columns: DEFAULT_COLUMNS.filter(c => c.default).map(c => c.id),
        notification_cooldown_hours: 4,
        rows_per_page: 50,
        show_categories: true,
        show_entities: true,
        show_cost_centers: false,
        export_format: 'csv',
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            // Load preferences from localStorage or API
            try {
                const saved = localStorage.getItem('fluxocaixa:preferences');
                if (saved) {
                    setPreferences(JSON.parse(saved));
                }
            } catch {
                // Use defaults
            }
        }
    }, [open]);

    const handleChange = (key: keyof Preferences, value: any) => {
        setPreferences(prev => {
            const updated = { ...prev, [key]: value };
            // Save to localStorage
            try {
                localStorage.setItem('fluxocaixa:preferences', JSON.stringify(updated));
            } catch {
                // Ignore
            }
            return updated;
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button
                    className="p-2 rounded-xl hover:bg-white/20 dark:hover:bg-white/5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    title="Configurações"
                >
                    <Settings className="w-5 h-5" />
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        Configurações do Fluxo de Caixa
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-1 gap-4 min-h-0">
                    {/* Sidebar tabs */}
                    <div className="w-40 shrink-0 space-y-1">
                        {TABS.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left",
                                        activeTab === tab.id
                                            ? "bg-primary-500 text-white"
                                            : "text-slate-600 dark:text-slate-400 hover:bg-white/20 dark:hover:bg-white/5"
                                    )}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto pr-2">
                        {activeTab === 'categories' && <CategoriesManager />}
                        {activeTab === 'tags' && <TagsTab />}
                        {activeTab === 'columns' && (
                            <ColumnsTab preferences={preferences} onChange={handleChange} />
                        )}
                        {activeTab === 'marketplace' && <MarketplaceTab />}
                        {activeTab === 'notifications' && (
                            <NotificationsTab preferences={preferences} onChange={handleChange} />
                        )}
                        {activeTab === 'export' && (
                            <ExportTab preferences={preferences} onChange={handleChange} />
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
