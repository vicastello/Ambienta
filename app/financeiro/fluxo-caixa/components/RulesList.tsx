'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Power, PowerOff, ChevronDown, ChevronUp, History, List, GitBranch } from 'lucide-react';
import RuleHistoryModal from './RuleHistoryModal';
import RulePrecedenceView from './RulePrecedenceView';
import { cn } from '@/lib/utils';
import type { AutoRule } from '@/lib/rules';
import {
    RULE_MARKETPLACES,
    RULE_MARKETPLACE_LABELS,
    normalizeMarketplaces,
    isAllMarketplaces,
    type RuleMarketplace,
} from '@/lib/rules';

interface RulesListProps {
    onEdit: (rule: AutoRule) => void;
    onCreateNew: () => void;
    refreshTrigger?: number;
}

export default function RulesList({ onEdit, onCreateNew, refreshTrigger }: RulesListProps) {
    const [rules, setRules] = useState<AutoRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | RuleMarketplace>('all');
    const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
    const [historyRule, setHistoryRule] = useState<{ id: string; name: string } | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'flow'>('list');

    useEffect(() => {
        fetchRules();
    }, [refreshTrigger]);

    const fetchRules = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/financeiro/rules');
            const data = await res.json();
            if (data.success) {
                setRules(data.rules);
            }
        } catch (error) {
            console.error('Error fetching rules:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleEnabled = async (rule: AutoRule) => {
        try {
            await fetch('/api/financeiro/rules', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
            });
            fetchRules();
        } catch (error) {
            console.error('Error toggling rule:', error);
        }
    };

    const handleDelete = async (ruleId: string) => {
        if (!confirm('Tem certeza que deseja excluir esta regra?')) return;

        try {
            await fetch(`/api/financeiro/rules?id=${ruleId}`, { method: 'DELETE' });
            fetchRules();
        } catch (error) {
            console.error('Error deleting rule:', error);
        }
    };

    const toggleExpand = (ruleId: string) => {
        setExpandedRules(prev => {
            const next = new Set(prev);
            if (next.has(ruleId)) {
                next.delete(ruleId);
            } else {
                next.add(ruleId);
            }
            return next;
        });
    };

    const filteredRules = rules.filter((rule) => {
        if (filter === 'all') return true;
        const marketplaces = normalizeMarketplaces(rule.marketplaces);
        return marketplaces.includes(filter);
    });

    const groupedRules = {
        system: filteredRules.filter(r => r.isSystemRule),
        user: filteredRules.filter(r => !r.isSystemRule),
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-main">Regras Automáticas</h2>
                    <span className="text-sm text-muted">({rules.length} regras)</span>
                </div>
                <button
                    onClick={onCreateNew}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Nova Regra
                </button>
            </div>

            {/* Filter + View Toggle */}
            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    {(['all', ...RULE_MARKETPLACES.map((mp) => mp.id)] as const).map(mp => (
                        <button
                            key={mp}
                            onClick={() => setFilter(mp)}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-sm transition-colors',
                                filter === mp
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-white/10 hover:bg-white/20 text-muted'
                            )}
                        >
                            {mp === 'all' ? 'Todos' : (RULE_MARKETPLACE_LABELS[mp] || mp)}
                        </button>
                    ))}
                </div>
                <div className="flex gap-1 bg-white/10 dark:bg-white/5 rounded-lg p-0.5">
                    <button
                        onClick={() => setViewMode('list')}
                        className={cn(
                            'p-2 rounded-md transition-colors',
                            viewMode === 'list'
                                ? 'bg-white dark:bg-gray-700 shadow-sm'
                                : 'hover:bg-white/20'
                        )}
                        title="Visualização em lista"
                    >
                        <List className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('flow')}
                        className={cn(
                            'p-2 rounded-md transition-colors',
                            viewMode === 'flow'
                                ? 'bg-white dark:bg-gray-700 shadow-sm'
                                : 'hover:bg-white/20'
                        )}
                        title="Visualização de fluxo"
                    >
                        <GitBranch className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Flow View */}
            {viewMode === 'flow' && (
                <RulePrecedenceView rules={rules} marketplace={filter} />
            )}

            {/* List View */}
            {viewMode === 'list' && groupedRules.user.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted uppercase tracking-wide">Suas Regras</h3>
                    {groupedRules.user.map(rule => (
                        <RuleCard
                            key={rule.id}
                            rule={rule}
                            expanded={expandedRules.has(rule.id)}
                            onToggleExpand={() => toggleExpand(rule.id)}
                            onEdit={() => onEdit(rule)}
                            onDelete={() => handleDelete(rule.id)}
                            onToggleEnabled={() => handleToggleEnabled(rule)}
                            onShowHistory={() => setHistoryRule({ id: rule.id, name: rule.name })}
                        />
                    ))}
                </div>
            )}

            {/* System Rules */}
            {viewMode === 'list' && (
                <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted uppercase tracking-wide">
                        Regras do Sistema
                        <span className="ml-2 text-xs font-normal">(não podem ser excluídas)</span>
                    </h3>
                    {groupedRules.system.map(rule => (
                        <RuleCard
                            key={rule.id}
                            rule={rule}
                            expanded={expandedRules.has(rule.id)}
                            onToggleExpand={() => toggleExpand(rule.id)}
                            onEdit={() => { }}
                            onDelete={() => { }}
                            onToggleEnabled={() => handleToggleEnabled(rule)}
                            isSystemRule
                        />
                    ))}
                </div>
            )}

            {filteredRules.length === 0 && (
                <div className="text-center py-12 text-muted">
                    <p>Nenhuma regra encontrada</p>
                    <button
                        onClick={onCreateNew}
                        className="mt-4 text-blue-500 hover:underline"
                    >
                        Criar primeira regra
                    </button>
                </div>
            )}

            {/* History Modal */}
            {historyRule && (
                <RuleHistoryModal
                    ruleId={historyRule.id}
                    ruleName={historyRule.name}
                    isOpen={true}
                    onClose={() => setHistoryRule(null)}
                    onRestored={() => fetchRules()}
                />
            )}
        </div>
    );
}

// Rule Card Component
function RuleCard({
    rule,
    expanded,
    onToggleExpand,
    onEdit,
    onDelete,
    onToggleEnabled,
    onShowHistory,
    isSystemRule = false,
}: {
    rule: AutoRule;
    expanded: boolean;
    onToggleExpand: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onToggleEnabled: () => void;
    onShowHistory?: () => void;
    isSystemRule?: boolean;
}) {
    const getMarketplaceColor = (mp: string) => {
        switch (mp) {
            case 'shopee': return 'bg-orange-500/20 text-orange-500';
            case 'mercado_livre': return 'bg-yellow-500/20 text-yellow-600';
            case 'magalu': return 'bg-blue-500/20 text-blue-500';
            case 'all': return 'bg-gray-500/20 text-gray-500';
            default: return 'bg-gray-500/20 text-gray-500';
        }
    };

    const getConditionSummary = () => {
        if (rule.conditions.length === 0) return 'Sem condições';
        const first = rule.conditions[0];
        const fieldLabel = first.field === 'description' ? 'descrição' :
            first.field === 'type' ? 'tipo' : first.field;
        const opLabel = first.operator === 'contains' ? 'contém' :
            first.operator === 'regex' ? 'corresponde a' : first.operator;
        const more = rule.conditions.length > 1
            ? ` +${rule.conditions.length - 1} condição(ões)`
            : '';
        return `${fieldLabel} ${opLabel} "${first.value}"${more}`;
    };

    const getActionSummary = () => {
        const actions = rule.actions.map(a => {
            if (a.type === 'add_tags') return `tags: ${a.tags?.join(', ')}`;
            if (a.type === 'mark_expense') return 'marcar despesa';
            if (a.type === 'skip') return 'pular';
            return a.type;
        });
        return actions.join(', ');
    };

    const marketplaces = normalizeMarketplaces(rule.marketplaces);
    const displayMarketplaces = isAllMarketplaces(marketplaces) ? ['all'] : marketplaces;

    return (
        <div className={cn(
            'glass-panel rounded-2xl border transition-all',
            rule.enabled
                ? 'border-white/20 dark:border-white/10'
                : 'border-white/10 dark:border-white/5 opacity-60'
        )}>
            <div
                className="p-4 cursor-pointer"
                onClick={onToggleExpand}
            >
                <div className="flex items-center gap-3">
                    {/* Priority indicator */}
                    <div className="flex items-center gap-1 min-w-[50px]">
                        <span className="text-xs text-muted">P:</span>
                        <span className="text-sm font-medium">{rule.priority}</span>
                    </div>

                    {/* Marketplace badges */}
                    <div className="flex flex-wrap gap-1">
                        {displayMarketplaces.map((mp) => (
                            <span
                                key={mp}
                                className={cn(
                                    'px-2 py-0.5 rounded-lg text-xs font-medium',
                                    getMarketplaceColor(mp)
                                )}
                            >
                                {mp === 'all' ? 'Todos' : (RULE_MARKETPLACE_LABELS[mp] || mp)}
                            </span>
                        ))}
                    </div>

                    {/* Rule name */}
                    <span className="font-medium text-main flex-1 flex items-center gap-2">
                        {rule.name}
                        {rule.version && rule.version > 1 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500">
                                v{rule.version}
                            </span>
                        )}
                        {rule.status === 'draft' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                rascunho
                            </span>
                        )}
                        {rule.hasDraft && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                alterações pendentes
                            </span>
                        )}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleEnabled(); }}
                            className={cn(
                                'p-1.5 rounded-lg transition-colors',
                                rule.enabled
                                    ? 'text-emerald-500 hover:bg-emerald-500/10'
                                    : 'text-gray-400 hover:bg-gray-500/10'
                            )}
                            title={rule.enabled ? 'Desativar' : 'Ativar'}
                        >
                            {rule.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                        </button>

                        {!isSystemRule && (
                            <>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                                    className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-500/10 transition-colors"
                                    title="Editar"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                {onShowHistory && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onShowHistory(); }}
                                        className="p-1.5 rounded-lg text-purple-500 hover:bg-purple-500/10 transition-colors"
                                        title="Ver histórico"
                                    >
                                        <History className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                                    title="Excluir"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </>
                        )}

                        {expanded ? (
                            <ChevronUp className="w-4 h-4 text-muted" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-muted" />
                        )}
                    </div>
                </div>

                {/* Summary line */}
                <div className="mt-2 text-sm text-muted">
                    <span className="text-blue-400">SE</span> {getConditionSummary()}{' '}
                    <span className="text-emerald-400">ENTÃO</span> {getActionSummary()}
                </div>

                {/* Metrics row - only show if rule has been applied */}
                {((rule.matchCount || 0) > 0 || rule.lastAppliedAt) && (
                    <div className="mt-2 flex items-center gap-3 text-xs">
                        {(rule.matchCount || 0) > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                                <span className="font-semibold">{rule.matchCount}</span> matches
                            </span>
                        )}
                        {(rule.totalImpact || 0) > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                                R$ <span className="font-semibold">{(rule.totalImpact || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </span>
                        )}
                        {rule.lastAppliedAt && (
                            <span className="text-gray-500 dark:text-gray-400">
                                Última: {new Date(rule.lastAppliedAt).toLocaleDateString('pt-BR')}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Expanded details */}
            {expanded && (
                <div className="px-4 pb-4 border-t border-white/10 pt-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <h4 className="font-medium text-muted mb-2">Condições ({rule.conditionLogic})</h4>
                            <ul className="space-y-1">
                                {rule.conditions.map((c, i) => (
                                    <li key={i} className="text-main">
                                        {c.field} <span className="text-blue-400">{c.operator}</span> &quot;{c.value}&quot;
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-medium text-muted mb-2">Ações</h4>
                            <ul className="space-y-1">
                                {rule.actions.map((a, i) => (
                                    <li key={i} className="text-main">
                                        {a.type === 'add_tags' && `Adicionar tags: ${a.tags?.join(', ')}`}
                                        {a.type === 'mark_expense' && 'Marcar como despesa'}
                                        {a.type === 'mark_income' && 'Marcar como receita'}
                                        {a.type === 'skip' && 'Pular importação'}
                                        {a.type === 'flag_review' && 'Marcar para revisão'}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    {rule.description && (
                        <p className="mt-3 text-sm text-muted">{rule.description}</p>
                    )}
                </div>
            )}
        </div>
    );
}
