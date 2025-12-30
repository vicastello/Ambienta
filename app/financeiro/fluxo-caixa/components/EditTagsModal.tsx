'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Plus, Save, Tag as TagIcon, Sparkles, LinkIcon, Unlink, Check, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AutoRule } from '@/lib/rules';

interface EditTagsModalProps {
    isOpen: boolean;
    onClose: () => void;
    payment: {
        marketplaceOrderId: string;
        transactionDescription?: string;
        transactionType?: string;
        tags: string[];
        isExpense?: boolean;
        expenseCategory?: string;
        appliedRuleId?: string;
    };
    marketplace: string;
    onSave: (
        updatedTags: string[],
        createRule: boolean,
        updatedType?: string,
        updatedDescription?: string,
        expenseCategory?: string,
        ruleId?: string | null,
        ruleActionFlags?: { includeTags: boolean; includeType: boolean; includeCategory: boolean },
        ruleCondition?: { field: string; operator: string; value: string }
    ) => void;
}

export default function EditTagsModal({
    isOpen,
    onClose,
    payment,
    marketplace,
    onSave,
}: EditTagsModalProps) {
    const [tags, setTags] = useState<string[]>(payment.tags || []);
    const [newTag, setNewTag] = useState('');
    const [transactionType, setTransactionType] = useState(payment.transactionType || '');
    const [transactionDescription, setTransactionDescription] = useState(payment.transactionDescription || '');
    const [expenseCategory, setExpenseCategory] = useState(payment.expenseCategory || '');
    const [createAutoRule, setCreateAutoRule] = useState(false);

    // Action selection for auto-rule
    const [includeTagsInRule, setIncludeTagsInRule] = useState(true);
    const [includeTypeInRule, setIncludeTypeInRule] = useState(true);
    const [includeCategoryInRule, setIncludeCategoryInRule] = useState(true);

    // Condition editing for auto-rule
    const [conditionField, setConditionField] = useState<'full_text' | 'description' | 'transaction_type'>('full_text');
    const [conditionOperator, setConditionOperator] = useState<'contains' | 'equals' | 'regex'>('contains');
    const [conditionValue, setConditionValue] = useState(
        (payment.transactionDescription || '').substring(0, 30).toLowerCase()
    );

    // NEW: Rules state using AutoRule type
    const [allRules, setAllRules] = useState<AutoRule[]>([]);
    const [loadingRules, setLoadingRules] = useState(false);
    const [appliedRuleId, setAppliedRuleId] = useState<string | null>(payment.appliedRuleId || null);
    const [showRulesSection, setShowRulesSection] = useState(false);

    // Fetch rules on mount from NEW API
    useEffect(() => {
        if (isOpen) {
            fetchRules();
        }
    }, [isOpen, marketplace]);

    const fetchRules = async () => {
        setLoadingRules(true);
        try {
            // Use new rules API
            const response = await fetch(`/api/financeiro/rules?marketplace=${marketplace}&enabled=true`);
            const data = await response.json();
            if (data.success) {
                // Filter only user-defined rules (not system rules)
                setAllRules((data.rules || []).filter((r: AutoRule) => !r.isSystemRule));
            }
        } catch (error) {
            console.error('Error fetching rules:', error);
        } finally {
            setLoadingRules(false);
        }
    };

    // Find matching rules based on description using new condition system
    const matchingRules = useMemo(() => {
        if (!transactionDescription && !transactionType) return [];

        const textToMatch = `${transactionDescription} ${transactionType}`.toLowerCase();

        return allRules.filter(rule => {
            if (!rule.enabled) return false;

            // Check if any condition matches
            return rule.conditions.some(condition => {
                const valueToCheck = condition.value?.toString().toLowerCase() || '';

                if (condition.field === 'full_text' || condition.field === 'description') {
                    if (condition.operator === 'contains') {
                        return textToMatch.includes(valueToCheck);
                    } else if (condition.operator === 'equals') {
                        return textToMatch === valueToCheck;
                    } else if (condition.operator === 'regex') {
                        try {
                            return new RegExp(condition.value?.toString() || '', 'i').test(textToMatch);
                        } catch {
                            return false;
                        }
                    }
                }
                return false;
            });
        }).sort((a, b) => b.priority - a.priority);
    }, [allRules, transactionDescription, transactionType]);

    // Get currently applied rule details
    const appliedRule = useMemo(() => {
        return allRules.find(r => r.id === appliedRuleId);
    }, [allRules, appliedRuleId]);

    // Handle ESC key to close modal
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleAddTag = () => {
        if (newTag && !tags.includes(newTag)) {
            setTags([...tags, newTag]);
            setNewTag('');
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const handleApplyRule = (rule: AutoRule) => {
        setAppliedRuleId(rule.id);

        const newTags = [...tags];
        let hasNewTags = false;

        rule.actions.forEach(action => {
            // Handle Tags
            if (action.type === 'add_tags' && action.tags) {
                action.tags.forEach(tag => {
                    if (!newTags.includes(tag)) {
                        newTags.push(tag);
                        hasNewTags = true;
                    }
                });
            }

            // Handle Type Override
            if (action.type === 'set_type' && action.transactionType) {
                setTransactionType(action.transactionType);
            }

            // Handle Description Override
            if (action.type === 'set_description' && action.description) {
                setTransactionDescription(action.description);
            }

            // Handle Category Override
            if (action.type === 'set_category' && action.category) {
                setExpenseCategory(action.category);
            }
        });

        if (hasNewTags) {
            setTags(newTags);
        }
    };

    const handleUnlinkRule = () => {
        setAppliedRuleId(null);
    };

    const handleSave = () => {
        // When creating a rule, only pass the values for selected actions
        const tagsForRule = createAutoRule && includeTagsInRule ? tags : tags;
        const typeForRule = createAutoRule && !includeTypeInRule ? undefined : transactionType;
        const categoryForRule = createAutoRule && !includeCategoryInRule ? undefined : expenseCategory;

        // For the rule creation, pass what should be included
        const ruleActionFlags = createAutoRule ? {
            includeTags: includeTagsInRule && tags.length > 0,
            includeType: includeTypeInRule && !!transactionType,
            includeCategory: includeCategoryInRule && !!expenseCategory,
        } : undefined;

        // Custom condition for rule
        const ruleCondition = createAutoRule ? {
            field: conditionField,
            operator: conditionOperator,
            value: conditionValue,
        } : undefined;

        onSave(
            tags, // Always update tags on the current entry
            createAutoRule,
            transactionType, // Always update type on current entry
            transactionDescription,
            expenseCategory, // Always update category on current entry
            appliedRuleId,
            ruleActionFlags,
            ruleCondition
        );
        onClose();
    };

    // Suggested tags based on description
    const suggestedTags = [
        'reembolso',
        'ajuste',
        'taxa',
        'frete',
        'anuncio',
        'marketing',
        'retirada',
        'comissao',
    ].filter(tag => !tags.includes(tag));

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/10 dark:bg-black/60 backdrop-blur-xl"
            onClick={onClose}
        >
            <div
                className="glass-card glass-tint max-w-3xl w-full rounded-3xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="relative border-b border-white/10 dark:border-white/5 px-8 py-6 bg-gradient-to-br from-white/5 to-transparent">
                    <div className="flex items-start justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                                Editar Transação
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                                Pedido: {payment.marketplaceOrderId}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full hover:bg-white/10 dark:hover:bg-white/5 transition-all duration-200 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="px-8 py-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    {/* Applied Rule Banner */}
                    {appliedRule && (
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-purple-500/20">
                                    <LinkIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                                        Regra Aplicada: {appliedRule.name}
                                    </p>
                                    <p className="text-xs text-purple-600 dark:text-purple-400">
                                        Prioridade: {appliedRule.priority}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleUnlinkRule}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 transition-colors"
                            >
                                <Unlink className="w-4 h-4" />
                                Desvincular
                            </button>
                        </div>
                    )}

                    {/* Matching Rules Section */}
                    {matchingRules.length > 0 && !appliedRule && (
                        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                            <div className="flex items-center gap-2 mb-3">
                                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                                    {matchingRules.length} regra(s) compatível(is) encontrada(s)
                                </span>
                            </div>
                            <div className="space-y-2">
                                {matchingRules.slice(0, 3).map(rule => (
                                    <div
                                        key={rule.id}
                                        className="flex items-center justify-between p-3 rounded-xl bg-white/50 dark:bg-white/5"
                                    >
                                        <div>
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                {rule.name}
                                            </p>
                                            <div className="flex gap-1 mt-1">
                                                {rule.actions.filter(a => a.type === 'add_tags').flatMap(a => a.tags || []).slice(0, 3).map(tag => (
                                                    <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleApplyRule(rule)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                            Aplicar
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Transaction Info - Editable */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Tipo de Transação
                            </label>
                            <input
                                type="text"
                                value={transactionType}
                                onChange={(e) => setTransactionType(e.target.value)}
                                placeholder="Ex: Renda de pedido, Taxa de publicidade..."
                                className="app-input w-full"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Descrição da Transação
                            </label>
                            <textarea
                                value={transactionDescription}
                                onChange={(e) => setTransactionDescription(e.target.value)}
                                placeholder="Ex: Recarga de Anúncios, Ajuste de valor..."
                                rows={3}
                                className="app-input w-full resize-none"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1.5">
                                <span>💡</span>
                                <span>Edite para padronizar. Regras automáticas usarão este texto.</span>
                            </p>
                        </div>

                        {/* Expense Category */}
                        {payment.isExpense && (
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    Categoria de Despesa
                                </label>
                                <select
                                    value={expenseCategory}
                                    onChange={(e) => setExpenseCategory(e.target.value)}
                                    className="app-input w-full cursor-pointer"
                                >
                                    <option value="">Selecione uma categoria...</option>
                                    <option value="anuncios">📢 Anúncios / Publicidade</option>
                                    <option value="taxas">💳 Taxas / Tarifas</option>
                                    <option value="comissao">💰 Comissão</option>
                                    <option value="frete">📦 Frete</option>
                                    <option value="reembolso">↩️ Reembolso</option>
                                    <option value="ajuste">⚖️ Ajuste</option>
                                    <option value="saque">🏦 Saque / Retirada</option>
                                    <option value="outros">📋 Outros</option>
                                </select>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1.5">
                                    <span>💡</span>
                                    <span>Categorize para melhor controle de despesas</span>
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>

                    {/* Tags Management */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                            Tags
                        </label>
                        <div className="glass-card p-3 rounded-2xl min-h-[80px] flex flex-wrap gap-2 items-start border border-gray-200 dark:border-gray-700 focus-within:border-blue-500 dark:focus-within:border-blue-400 transition-all">
                            {/* Current Tags */}
                            {tags.map(tag => (
                                <span
                                    key={tag}
                                    className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 dark:bg-blue-400/10 border border-blue-500/20 dark:border-blue-400/20 text-blue-700 dark:text-blue-400 rounded-full text-sm font-medium hover:bg-blue-500/20 dark:hover:bg-blue-400/20 transition-all cursor-pointer"
                                >
                                    <TagIcon className="w-3.5 h-3.5" />
                                    {tag}
                                    <button
                                        onClick={() => handleRemoveTag(tag)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 -mr-1 p-0.5 rounded-full hover:bg-red-100/50 dark:hover:bg-red-900/20"
                                        title="Remover tag"
                                    >
                                        <X className="w-3.5 h-3.5 hover:text-red-600 dark:hover:text-red-400" />
                                    </button>
                                </span>
                            ))}

                            {/* Input for new tag */}
                            <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddTag();
                                    }
                                }}
                                placeholder={tags.length === 0 ? "Digite para adicionar tags..." : "Adicionar mais..."}
                                className="flex-1 min-w-[200px] bg-transparent border-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 px-2 py-1.5"
                            />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1.5">
                            <span>💡</span>
                            <span>Digite e pressione Enter para adicionar. Passe o mouse sobre as tags para remover.</span>
                        </p>
                    </div>

                    {/* Suggested Tags */}
                    {suggestedTags.length > 0 && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                                Tags Sugeridas
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {suggestedTags.map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => setTags([...tags, tag])}
                                        className="px-4 py-2 glass-card rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-white/20 dark:hover:bg-white/5 transition-all border border-white/10 dark:border-white/5"
                                    >
                                        + {tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>

                    {/* All Active Rules Section (Collapsible) */}
                    <div className="glass-card p-4 rounded-2xl border border-gray-200 dark:border-gray-700">
                        <button
                            type="button"
                            onClick={() => setShowRulesSection(!showRulesSection)}
                            className="w-full flex items-center justify-between"
                        >
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-gray-500" />
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    Regras Ativas ({allRules.filter(r => r.enabled).length})
                                </span>
                            </div>
                            {showRulesSection ? (
                                <ChevronUp className="w-4 h-4 text-gray-400" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                            )}
                        </button>

                        {showRulesSection && (
                            <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                                {loadingRules ? (
                                    <p className="text-sm text-gray-500">Carregando regras...</p>
                                ) : allRules.filter(r => r.enabled).length === 0 ? (
                                    <p className="text-sm text-gray-500">Nenhuma regra ativa para {marketplace}</p>
                                ) : (
                                    allRules.filter(r => r.enabled).map(rule => (
                                        <div
                                            key={rule.id}
                                            className={cn(
                                                "flex items-center justify-between p-2 rounded-lg",
                                                rule.id === appliedRuleId
                                                    ? "bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700"
                                                    : "bg-gray-50 dark:bg-gray-800/50"
                                            )}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                                    {rule.name}
                                                </p>
                                                <div className="flex gap-1 mt-0.5">
                                                    {rule.actions.filter(a => a.type === 'add_tags').flatMap(a => a.tags || []).slice(0, 2).map(tag => (
                                                        <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                    {rule.actions.filter(a => a.type === 'add_tags').flatMap(a => a.tags || []).length > 2 && (
                                                        <span className="text-[10px] text-gray-500">+{rule.actions.filter(a => a.type === 'add_tags').flatMap(a => a.tags || []).length - 2}</span>
                                                    )}
                                                </div>
                                            </div>
                                            {rule.id === appliedRuleId ? (
                                                <span className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400">
                                                    <Check className="w-3 h-3" />
                                                    Aplicada
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => handleApplyRule(rule)}
                                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                >
                                                    Aplicar
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Create Auto-Rule */}
                    {!appliedRule && (
                        <div className="glass-card p-5 rounded-2xl border border-purple-500/20 dark:border-purple-400/20">
                            <label className="flex items-start gap-4 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={createAutoRule}
                                    onChange={(e) => setCreateAutoRule(e.target.checked)}
                                    className="mt-1 w-5 h-5 text-purple-600 rounded focus:ring-2 focus:ring-purple-500 focus:ring-offset-0 border-gray-300 dark:border-gray-600 cursor-pointer"
                                />
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Sparkles className="w-5 h-5 text-purple-500 dark:text-purple-400" />
                                        <span className="font-semibold text-gray-900 dark:text-white">
                                            Criar regra automática
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                                        Aplicar automaticamente em futuras importações com descrição semelhante
                                    </p>
                                </div>
                            </label>

                            {/* Rule Preview - shown when checkbox is checked */}
                            {createAutoRule && (
                                <div className="mt-4 p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700/50">
                                    <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-300 mb-3">
                                        📋 Preview da Regra
                                    </h4>

                                    {/* Conditions - Editable */}
                                    <div className="mb-4">
                                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                            Condição
                                        </span>
                                        <div className="mt-2 flex flex-wrap gap-2 items-center">
                                            {/* Field selector */}
                                            <select
                                                value={conditionField}
                                                onChange={(e) => setConditionField(e.target.value as 'full_text' | 'description' | 'transaction_type')}
                                                className="px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300"
                                            >
                                                <option value="full_text">Texto completo</option>
                                                <option value="description">Descrição</option>
                                                <option value="transaction_type">Tipo de transação</option>
                                            </select>

                                            {/* Operator selector */}
                                            <select
                                                value={conditionOperator}
                                                onChange={(e) => setConditionOperator(e.target.value as 'contains' | 'equals' | 'regex')}
                                                className="px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300"
                                            >
                                                <option value="contains">contém</option>
                                                <option value="equals">é igual a</option>
                                                <option value="regex">regex</option>
                                            </select>

                                            {/* Value input */}
                                            <input
                                                type="text"
                                                value={conditionValue}
                                                onChange={(e) => setConditionValue(e.target.value)}
                                                placeholder="Valor a buscar..."
                                                className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-700 text-gray-900 dark:text-white placeholder-gray-400"
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            💡 A regra será aplicada quando o texto corresponder a esta condição
                                        </p>
                                    </div>

                                    {/* Actions */}
                                    <div>
                                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                            Selecione as ações a incluir na regra
                                        </span>
                                        <div className="mt-2 space-y-2">
                                            {/* Tags action checkbox */}
                                            {tags.length > 0 && (
                                                <label className={cn(
                                                    "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                                    includeTagsInRule
                                                        ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700"
                                                        : "bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700 opacity-60"
                                                )}>
                                                    <input
                                                        type="checkbox"
                                                        checked={includeTagsInRule}
                                                        onChange={(e) => setIncludeTagsInRule(e.target.checked)}
                                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                    />
                                                    <span className="text-blue-500">🏷️</span>
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                        Adicionar tags:
                                                    </span>
                                                    <div className="flex flex-wrap gap-1">
                                                        {tags.map(t => (
                                                            <span key={t} className="px-1.5 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                                                {t}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </label>
                                            )}

                                            {/* Type action checkbox */}
                                            {transactionType && (
                                                <label className={cn(
                                                    "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                                    includeTypeInRule
                                                        ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700"
                                                        : "bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700 opacity-60"
                                                )}>
                                                    <input
                                                        type="checkbox"
                                                        checked={includeTypeInRule}
                                                        onChange={(e) => setIncludeTypeInRule(e.target.checked)}
                                                        className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                                                    />
                                                    <span className="text-green-500">📝</span>
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                        Definir tipo: <strong>{transactionType}</strong>
                                                    </span>
                                                </label>
                                            )}

                                            {/* Category action checkbox */}
                                            {expenseCategory && (
                                                <label className={cn(
                                                    "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                                    includeCategoryInRule
                                                        ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700"
                                                        : "bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700 opacity-60"
                                                )}>
                                                    <input
                                                        type="checkbox"
                                                        checked={includeCategoryInRule}
                                                        onChange={(e) => setIncludeCategoryInRule(e.target.checked)}
                                                        className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                                                    />
                                                    <span className="text-amber-500">📁</span>
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                        Definir categoria: <strong>{expenseCategory}</strong>
                                                    </span>
                                                </label>
                                            )}

                                            {/* Warning if no actions */}
                                            {tags.length === 0 && !transactionType && !expenseCategory && (
                                                <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
                                                    <AlertCircle className="w-4 h-4" />
                                                    <span className="text-sm">
                                                        Adicione tags, tipo ou categoria para criar a regra
                                                    </span>
                                                </div>
                                            )}

                                            {/* Warning if no actions selected */}
                                            {(tags.length > 0 || transactionType || expenseCategory) &&
                                                !includeTagsInRule && !includeTypeInRule && !includeCategoryInRule && (
                                                    <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
                                                        <AlertCircle className="w-4 h-4" />
                                                        <span className="text-sm">
                                                            Selecione pelo menos uma ação para incluir na regra
                                                        </span>
                                                    </div>
                                                )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-white/10 dark:border-white/5 px-8 py-5 flex justify-end gap-3 bg-gradient-to-br from-transparent to-white/5">
                    <button
                        onClick={onClose}
                        className="app-btn-secondary px-6 py-2.5"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="app-btn-primary px-6 py-2.5 inline-flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}
