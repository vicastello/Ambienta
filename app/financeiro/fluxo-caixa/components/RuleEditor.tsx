'use client';

import { useState } from 'react';
import { X, Plus, Trash2, Play, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    type AutoRule,
    type CreateRulePayload,
    type RuleCondition,
    type RuleAction,
    type RuleConditionField,
    type RuleConditionOperator,
    createEmptyRule,
    createEmptyCondition,
    FIELD_LABELS,
    OPERATOR_LABELS,
    getOperatorsForField,
} from '@/lib/rules';

interface RuleEditorProps {
    rule?: AutoRule;
    onSave: (rule: CreateRulePayload) => Promise<void>;
    onCancel: () => void;
}

export default function RuleEditor({ rule, onSave, onCancel }: RuleEditorProps) {
    const [formData, setFormData] = useState<CreateRulePayload>(() =>
        rule ? {
            name: rule.name,
            description: rule.description,
            marketplace: rule.marketplace,
            conditions: rule.conditions,
            conditionLogic: rule.conditionLogic,
            actions: rule.actions,
            priority: rule.priority,
            enabled: rule.enabled,
            stopOnMatch: rule.stopOnMatch,
        } : createEmptyRule()
    );

    const [testText, setTestText] = useState('');
    const [testResult, setTestResult] = useState<{ matched: boolean; tags: string[] } | null>(null);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);

    const updateCondition = (index: number, updates: Partial<RuleCondition>) => {
        const newConditions = [...formData.conditions];
        newConditions[index] = { ...newConditions[index], ...updates };
        setFormData({ ...formData, conditions: newConditions });
    };

    const addCondition = () => {
        setFormData({
            ...formData,
            conditions: [...formData.conditions, createEmptyCondition()],
        });
    };

    const removeCondition = (index: number) => {
        if (formData.conditions.length <= 1) return;
        const newConditions = formData.conditions.filter((_, i) => i !== index);
        setFormData({ ...formData, conditions: newConditions });
    };

    const updateAction = (index: number, updates: Partial<RuleAction>) => {
        const newActions = [...formData.actions];
        newActions[index] = { ...newActions[index], ...updates };
        setFormData({ ...formData, actions: newActions });
    };

    const addTag = (actionIndex: number, tag: string) => {
        const action = formData.actions[actionIndex];
        if (action.type !== 'add_tags' || !tag.trim()) return;
        const tags = [...(action.tags || []), tag.trim().toLowerCase()];
        updateAction(actionIndex, { tags: [...new Set(tags)] });
    };

    const removeTag = (actionIndex: number, tag: string) => {
        const action = formData.actions[actionIndex];
        if (action.type !== 'add_tags') return;
        updateAction(actionIndex, { tags: action.tags?.filter(t => t !== tag) });
    };

    const handleTest = async () => {
        if (!testText.trim()) return;

        try {
            const res = await fetch('/api/financeiro/rules/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rule: formData,
                    testPayments: [{
                        marketplaceOrderId: 'TEST',
                        transactionDescription: testText,
                        transactionType: '',
                        amount: 0,
                        paymentDate: new Date().toISOString(),
                    }],
                }),
            });
            const data = await res.json();
            if (data.success && data.results.length > 0) {
                setTestResult({
                    matched: data.results[0].matched,
                    tags: data.results[0].appliedTags || [],
                });
            }
        } catch (error) {
            console.error('Test error:', error);
        }
    };

    const handleSave = async () => {
        setErrors([]);
        const validationErrors: string[] = [];

        if (!formData.name.trim()) {
            validationErrors.push('Nome é obrigatório');
        }

        if (formData.conditions.some(c => !c.value)) {
            validationErrors.push('Todas as condições precisam de um valor');
        }

        if (formData.actions.some(a => a.type === 'add_tags' && (!a.tags || a.tags.length === 0))) {
            validationErrors.push('Adicione pelo menos uma tag');
        }

        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            return;
        }

        setSaving(true);
        try {
            await onSave(formData);
        } catch (_error) {
            setErrors(['Erro ao salvar regra']);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-semibold text-main">
                        {rule ? 'Editar Regra' : 'Nova Regra'}
                    </h2>
                    <button
                        onClick={onCancel}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-muted mb-1">Nome da Regra</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Ex: Compras de ADS"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted mb-1">Marketplace</label>
                            <select
                                value={formData.marketplace}
                                onChange={e => setFormData({ ...formData, marketplace: e.target.value })}
                                className="w-full px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="all">Todos</option>
                                <option value="shopee">Shopee</option>
                                <option value="mercado_livre">Mercado Livre</option>
                                <option value="magalu">Magalu</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted mb-1">Prioridade (1-100)</label>
                            <input
                                type="number"
                                min={1}
                                max={100}
                                value={formData.priority}
                                onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) || 50 })}
                                className="w-full px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {/* Conditions */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-sm font-medium text-muted">Condições</label>
                            <div className="flex items-center gap-2">
                                <select
                                    value={formData.conditionLogic}
                                    onChange={e => setFormData({ ...formData, conditionLogic: e.target.value as 'AND' | 'OR' })}
                                    className="px-3 py-1 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                                >
                                    <option value="AND">Todas (E)</option>
                                    <option value="OR">Qualquer (OU)</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {formData.conditions.map((condition, index) => (
                                <ConditionRow
                                    key={condition.id}
                                    condition={condition}
                                    onChange={updates => updateCondition(index, updates)}
                                    onRemove={() => removeCondition(index)}
                                    canRemove={formData.conditions.length > 1}
                                />
                            ))}
                        </div>

                        <button
                            onClick={addCondition}
                            className="mt-3 flex items-center gap-2 text-sm text-blue-500 hover:text-blue-600"
                        >
                            <Plus className="w-4 h-4" />
                            Adicionar condição
                        </button>
                    </div>

                    {/* Actions */}
                    <div>
                        <label className="block text-sm font-medium text-muted mb-3">Ações</label>

                        {formData.actions.map((action, index) => (
                            <ActionRow
                                key={index}
                                action={action}
                                onChange={updates => updateAction(index, updates)}
                                onAddTag={tag => addTag(index, tag)}
                                onRemoveTag={tag => removeTag(index, tag)}
                            />
                        ))}
                    </div>

                    {/* Test Area */}
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                        <label className="block text-sm font-medium text-muted mb-2">
                            <Info className="w-4 h-4 inline-block mr-1" />
                            Testar Regra
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={testText}
                                onChange={e => setTestText(e.target.value)}
                                placeholder="Digite um texto para testar..."
                                className="flex-1 px-4 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleTest}
                                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl flex items-center gap-2"
                            >
                                <Play className="w-4 h-4" />
                                Testar
                            </button>
                        </div>

                        {testResult && (
                            <div className={cn(
                                'mt-3 p-3 rounded-lg flex items-center gap-2',
                                testResult.matched
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400'
                            )}>
                                {testResult.matched ? (
                                    <>
                                        <CheckCircle className="w-5 h-5" />
                                        <span>✓ Match! Tags: {testResult.tags.join(', ') || 'nenhuma'}</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-5 h-5" />
                                        <span>✗ Não corresponde</span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Errors */}
                    {errors.length > 0 && (
                        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                            <div className="flex items-start gap-2 text-rose-700 dark:text-rose-400">
                                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <ul className="text-sm space-y-1">
                                    {errors.map((err, i) => (
                                        <li key={i}>{err}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={onCancel}
                        className="px-6 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50"
                    >
                        {saving ? 'Salvando...' : 'Salvar Regra'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Condition Row Component
function ConditionRow({
    condition,
    onChange,
    onRemove,
    canRemove,
}: {
    condition: RuleCondition;
    onChange: (updates: Partial<RuleCondition>) => void;
    onRemove: () => void;
    canRemove: boolean;
}) {
    const operators = getOperatorsForField(condition.field);

    return (
        <div className="flex items-center gap-2">
            <select
                value={condition.field}
                onChange={e => onChange({ field: e.target.value as RuleConditionField })}
                className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm"
            >
                {Object.entries(FIELD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                ))}
            </select>

            <select
                value={condition.operator}
                onChange={e => onChange({ operator: e.target.value as RuleConditionOperator })}
                className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm"
            >
                {operators.map(op => (
                    <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                ))}
            </select>

            <input
                type="text"
                value={condition.value as string}
                onChange={e => onChange({ value: e.target.value })}
                placeholder="Valor..."
                className="flex-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm"
            />

            {canRemove && (
                <button
                    onClick={onRemove}
                    className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}

// Action Row Component - supports multiple action types
function ActionRow({
    action,
    onChange,
    onAddTag,
    onRemoveTag,
}: {
    action: RuleAction;
    onChange: (updates: Partial<RuleAction>) => void;
    onAddTag: (tag: string) => void;
    onRemoveTag: (tag: string) => void;
}) {
    const [newTag, setNewTag] = useState('');

    const handleAddTag = () => {
        if (newTag.trim()) {
            onAddTag(newTag);
            setNewTag('');
        }
    };

    // Helper to toggle between action types
    const setActionType = (type: RuleAction['type']) => {
        onChange({
            type,
            tags: type === 'add_tags' ? (action.tags || []) : undefined,
            transactionType: type === 'set_type' ? (action.transactionType || '') : undefined,
            description: type === 'set_description' ? (action.description || '') : undefined,
            category: type === 'set_category' ? (action.category || '') : undefined,
        });
    };

    const actionTypes = [
        { type: 'add_tags' as const, label: 'Adicionar Tags', icon: '🏷️' },
        { type: 'set_type' as const, label: 'Definir Tipo', icon: '📝' },
        { type: 'set_description' as const, label: 'Definir Descrição', icon: '📄' },
        { type: 'set_category' as const, label: 'Definir Categoria', icon: '📁' },
        { type: 'mark_expense' as const, label: 'Marcar Despesa', icon: '💸' },
        { type: 'mark_income' as const, label: 'Marcar Receita', icon: '💰' },
    ];

    return (
        <div className="space-y-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
            {/* Action Type Selector */}
            <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Tipo de Ação
                </label>
                <select
                    value={action.type}
                    onChange={e => setActionType(e.target.value as RuleAction['type'])}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
                >
                    {actionTypes.map(at => (
                        <option key={at.type} value={at.type}>
                            {at.icon} {at.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Tags Input */}
            {action.type === 'add_tags' && (
                <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                        Tags a adicionar
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2">
                        {action.tags?.map(tag => (
                            <span
                                key={tag}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm"
                            >
                                {tag}
                                <button
                                    onClick={() => onRemoveTag(tag)}
                                    className="hover:text-blue-900 dark:hover:text-blue-200"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newTag}
                            onChange={e => setNewTag(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                            placeholder="Nova tag..."
                            className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm"
                        />
                        <button
                            onClick={handleAddTag}
                            className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm"
                        >
                            Adicionar
                        </button>
                    </div>
                </div>
            )}

            {/* Transaction Type Input */}
            {action.type === 'set_type' && (
                <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                        Novo Tipo de Transação
                    </label>
                    <input
                        type="text"
                        value={action.transactionType || ''}
                        onChange={e => onChange({ transactionType: e.target.value })}
                        placeholder="Ex: ADS/Marketing, Taxa de Serviço..."
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
                    />
                </div>
            )}

            {/* Description Input */}
            {action.type === 'set_description' && (
                <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                        Nova Descrição
                    </label>
                    <input
                        type="text"
                        value={action.description || ''}
                        onChange={e => onChange({ description: e.target.value })}
                        placeholder="Ex: Investimento em Marketing..."
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
                    />
                </div>
            )}

            {/* Category Input */}
            {action.type === 'set_category' && (
                <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                        Categoria
                    </label>
                    <select
                        value={action.category || ''}
                        onChange={e => onChange({ category: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
                    >
                        <option value="">Selecione...</option>
                        <option value="anuncios">📢 Anúncios / Publicidade</option>
                        <option value="taxas">💳 Taxas / Tarifas</option>
                        <option value="comissao">💰 Comissão</option>
                        <option value="frete">📦 Frete</option>
                        <option value="reembolso">↩️ Reembolso</option>
                        <option value="ajuste">⚖️ Ajuste</option>
                        <option value="saque">🏦 Saque / Retirada</option>
                        <option value="outros">📋 Outros</option>
                    </select>
                </div>
            )}

            {/* Expense/Income info */}
            {(action.type === 'mark_expense' || action.type === 'mark_income') && (
                <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    {action.type === 'mark_expense'
                        ? 'Entradas correspondentes serão marcadas como DESPESA'
                        : 'Entradas correspondentes serão marcadas como RECEITA'}
                </div>
            )}
        </div>
    );
}
