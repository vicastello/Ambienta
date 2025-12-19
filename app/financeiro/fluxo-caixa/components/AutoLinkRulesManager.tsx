'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, Tag, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type AutoLinkRule = {
    id: string;
    marketplace: string;
    transaction_type_pattern: string;
    action: 'skip' | 'auto_tag' | 'link_to_expense';
    tags: string[];
    priority: number;
};

export default function AutoLinkRulesManager() {
    const [rules, setRules] = useState<AutoLinkRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState<Partial<AutoLinkRule>>({
        marketplace: 'shopee',
        transaction_type_pattern: '',
        action: 'auto_tag',
        tags: [],
        priority: 0,
    });

    useEffect(() => {
        fetchRules();
    }, []);

    const fetchRules = async () => {
        try {
            const response = await fetch('/api/financeiro/pagamentos/auto-link-rules');
            const data = await response.json();
            if (data.success) {
                setRules(data.rules);
            }
        } catch (err) {
            setError('Erro ao carregar regras');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        try {
            const response = await fetch('/api/financeiro/pagamentos/auto-link-rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await response.json();
            if (data.success) {
                setRules([data.rule, ...rules]);
                setCreating(false);
                resetForm();
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Erro ao criar regra');
        }
    };

    const handleUpdate = async (id: string) => {
        try {
            const response = await fetch('/api/financeiro/pagamentos/auto-link-rules', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...formData }),
            });

            const data = await response.json();
            if (data.success) {
                setRules(rules.map(r => r.id === id ? data.rule : r));
                setEditing(null);
                resetForm();
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Erro ao atualizar regra');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja deletar esta regra?')) return;

        try {
            const response = await fetch(`/api/financeiro/pagamentos/auto-link-rules?id=${id}`, {
                method: 'DELETE',
            });

            const data = await response.json();
            if (data.success) {
                setRules(rules.filter(r => r.id !== id));
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Erro ao deletar regra');
        }
    };

    const startEdit = (rule: AutoLinkRule) => {
        setEditing(rule.id);
        setFormData(rule);
    };

    const resetForm = () => {
        setFormData({
            marketplace: 'shopee',
            transaction_type_pattern: '',
            action: 'auto_tag',
            tags: [],
            priority: 0,
        });
    };

    const addTag = (tag: string) => {
        if (tag && !formData.tags?.includes(tag)) {
            setFormData({ ...formData, tags: [...(formData.tags || []), tag] });
        }
    };

    const removeTag = (tag: string) => {
        setFormData({ ...formData, tags: formData.tags?.filter(t => t !== tag) || [] });
    };

    if (loading) {
        return <div className="text-center py-8">Carregando...</div>;
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-main">Regras de Auto-Vínculo</h3>
                    <p className="text-sm text-muted">Gerencie regras personalizadas para tagging automático</p>
                </div>
                <button
                    onClick={() => {
                        setCreating(true);
                        resetForm();
                    }}
                    className="app-btn-primary inline-flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Nova Regra
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Create Form */}
            {creating && (
                <div className="glass-panel p-4 rounded-lg border-2 border-blue-500/30">
                    <h4 className="font-medium text-main mb-4">Nova Regra</h4>
                    <RuleForm
                        data={formData}
                        onChange={setFormData}
                        onAddTag={addTag}
                        onRemoveTag={removeTag}
                    />
                    <div className="flex gap-2 mt-4">
                        <button onClick={handleCreate} className="app-btn-primary">
                            <Save className="w-4 h-4 mr-2" />
                            Salvar
                        </button>
                        <button
                            onClick={() => {
                                setCreating(false);
                                resetForm();
                            }}
                            className="app-btn-secondary"
                        >
                            <X className="w-4 h-4 mr-2" />
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Rules List */}
            <div className="space-y-2">
                {rules.map(rule => (
                    <div
                        key={rule.id}
                        className={cn(
                            'glass-panel p-4 rounded-lg',
                            editing === rule.id && 'border-2 border-blue-500/30'
                        )}
                    >
                        {editing === rule.id ? (
                            <>
                                <RuleForm
                                    data={formData}
                                    onChange={setFormData}
                                    onAddTag={addTag}
                                    onRemoveTag={removeTag}
                                />
                                <div className="flex gap-2 mt-4">
                                    <button
                                        onClick={() => handleUpdate(rule.id)}
                                        className="app-btn-primary"
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        Salvar
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditing(null);
                                            resetForm();
                                        }}
                                        className="app-btn-secondary"
                                    >
                                        <X className="w-4 h-4 mr-2" />
                                        Cancelar
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                            {rule.marketplace}
                                        </span>
                                        <span className="px-2 py-1 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded">
                                            Prioridade: {rule.priority}
                                        </span>
                                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 rounded">
                                            {rule.action}
                                        </span>
                                    </div>
                                    <p className="text-sm font-mono text-main mb-2">
                                        Padrão: {rule.transaction_type_pattern}
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {rule.tags.map(tag => (
                                            <span
                                                key={tag}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-xs"
                                            >
                                                <Tag className="w-3 h-3" />
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex gap-2 ml-4">
                                    <button
                                        onClick={() => startEdit(rule)}
                                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(rule.id)}
                                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {rules.length === 0 && !creating && (
                <div className="text-center py-12 text-muted">
                    Nenhuma regra personalizada. Clique em "Nova Regra" para adicionar.
                </div>
            )}
        </div>
    );
}

function RuleForm({
    data,
    onChange,
    onAddTag,
    onRemoveTag,
}: {
    data: Partial<AutoLinkRule>;
    onChange: (data: Partial<AutoLinkRule>) => void;
    onAddTag: (tag: string) => void;
    onRemoveTag: (tag: string) => void;
}) {
    const [tagInput, setTagInput] = useState('');

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-main mb-1">Marketplace</label>
                    <select
                        value={data.marketplace}
                        onChange={(e) => onChange({ ...data, marketplace: e.target.value })}
                        className="app-input"
                    >
                        <option value="shopee">Shopee</option>
                        <option value="magalu">Magalu</option>
                        <option value="mercado_livre">Mercado Livre</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-main mb-1">Ação</label>
                    <select
                        value={data.action}
                        onChange={(e) => onChange({ ...data, action: e.target.value as any })}
                        className="app-input"
                    >
                        <option value="auto_tag">Auto Tag</option>
                        <option value="skip">Ignorar</option>
                        <option value="link_to_expense">Vincular a Despesa</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-main mb-1">
                    Padrão (regex)
                </label>
                <input
                    type="text"
                    value={data.transaction_type_pattern}
                    onChange={(e) => onChange({ ...data, transaction_type_pattern: e.target.value })}
                    placeholder=".*reembolso.*"
                    className="app-input"
                />
                <p className="text-xs text-muted mt-1">Use regex para match flexível, ex: .*palavra.*</p>
            </div>

            <div>
                <label className="block text-sm font-medium text-main mb-1">Prioridade</label>
                <input
                    type="number"
                    value={data.priority}
                    onChange={(e) => onChange({ ...data, priority: parseInt(e.target.value) })}
                    className="app-input"
                />
                <p className="text-xs text-muted mt-1">Maior prioridade = executa primeiro</p>
            </div>

            <div>
                <label className="block text-sm font-medium text-main mb-1">Tags</label>
                <div className="flex gap-2 mb-2">
                    <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                onAddTag(tagInput);
                                setTagInput('');
                            }
                        }}
                        placeholder="Digite uma tag e pressione Enter"
                        className="app-input flex-1"
                    />
                </div>
                <div className="flex flex-wrap gap-1">
                    {data.tags?.map(tag => (
                        <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-xs"
                        >
                            <Tag className="w-3 h-3" />
                            {tag}
                            <button
                                onClick={() => onRemoveTag(tag)}
                                className="hover:text-red-500"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
