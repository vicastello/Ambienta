'use client';

import { useState } from 'react';
import { Sparkles, Check, X, ChevronDown, ChevronUp, Info, Zap, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FIELD_LABELS, OPERATOR_LABELS } from '@/lib/rules';
import type { ConditionEvalResult, RuleAction } from '@/lib/rules/types';

/**
 * Match detail structure from the backend
 */
export interface MatchedRuleDetail {
    ruleId: string;
    ruleName: string;
    matchedConditions: number;
    totalConditions: number;
    conditionResults: ConditionEvalResult[];
    appliedActions: RuleAction[];
    stoppedProcessing: boolean;
    isSystemRule?: boolean;
}

interface RuleMatchExplainerProps {
    details?: MatchedRuleDetail[];
    fallbackNames?: string[];
    className?: string;
    compact?: boolean;
}

/**
 * Action type labels in Portuguese
 */
const ACTION_LABELS: Record<string, string> = {
    add_tags: 'Adicionar tags',
    set_type: 'Definir tipo',
    set_description: 'Definir descrição',
    set_category: 'Definir categoria',
    mark_expense: 'Marcar como saída',
    mark_income: 'Marcar como entrada',
    skip: 'Ignorar',
    flag_review: 'Sinalizar para revisão',
};

/**
 * Format action for display
 */
function formatAction(action: RuleAction): string {
    const label = ACTION_LABELS[action.type] || action.type;

    if (action.type === 'add_tags' && action.tags) {
        return `${label}: ${action.tags.join(', ')}`;
    }
    if (action.type === 'set_type' && action.transactionType) {
        return `${label}: "${action.transactionType}"`;
    }
    if (action.type === 'set_category' && action.category) {
        return `${label}: "${action.category}"`;
    }
    if (action.type === 'set_description' && action.description) {
        return `${label}: "${action.description}"`;
    }
    if (action.type === 'flag_review' && action.reviewNote) {
        return `${label}: "${action.reviewNote}"`;
    }

    return label;
}

/**
 * ConditionBadge - Shows a single condition evaluation result
 */
function ConditionBadge({ result }: { result: ConditionEvalResult }) {
    const fieldLabel = FIELD_LABELS[result.field as keyof typeof FIELD_LABELS] || result.field;
    const operatorLabel = OPERATOR_LABELS[result.operator as keyof typeof OPERATOR_LABELS] || result.operator;

    return (
        <div className={cn(
            "flex items-start gap-2 p-2 rounded-lg text-xs",
            result.matched
                ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
                : "bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
        )}>
            <div className={cn(
                "flex-shrink-0 mt-0.5",
                result.matched ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"
            )}>
                {result.matched ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-700 dark:text-slate-200">
                    {fieldLabel} {operatorLabel} <span className="text-blue-600 dark:text-blue-400">&quot;{String(result.expectedValue)}&quot;</span>
                </div>
                <div className="text-gray-500 dark:text-gray-400 mt-0.5 truncate" title={String(result.actualValue)}>
                    Valor atual: <span className={result.matched ? "text-emerald-600 dark:text-emerald-400" : "text-gray-600 dark:text-gray-300"}>
                        &quot;{String(result.actualValue).slice(0, 60)}{String(result.actualValue).length > 60 ? '...' : ''}&quot;
                    </span>
                </div>
            </div>
        </div>
    );
}

/**
 * RuleDetailCard - Shows details for a single rule match
 */
function RuleDetailCard({ detail, defaultExpanded = false }: { detail: MatchedRuleDetail; defaultExpanded?: boolean }) {
    const [expanded, setExpanded] = useState(defaultExpanded);

    const matchedCount = detail.conditionResults.filter(r => r.matched).length;
    const totalConditions = detail.totalConditions || detail.conditionResults.length;

    return (
        <div className="border border-white/20 dark:border-white/10 rounded-xl overflow-hidden bg-white/30 dark:bg-white/5">
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/20 dark:hover:bg-white/10 transition-colors"
            >
                <div className="flex items-center gap-2">
                    {detail.isSystemRule ? (
                        <Shield className="w-4 h-4 text-purple-500" title="Regra do sistema" />
                    ) : (
                        <Zap className="w-4 h-4 text-blue-500" title="Regra personalizada" />
                    )}
                    <span className="font-medium text-sm text-slate-800 dark:text-slate-100">
                        {detail.ruleName}
                    </span>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                        {matchedCount}/{totalConditions} condições
                    </span>
                </div>
                {expanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
            </button>

            {/* Expanded Content */}
            {expanded && (
                <div className="px-3 pb-3 space-y-3 border-t border-white/10 dark:border-white/5 pt-3">
                    {/* Conditions */}
                    <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                            <Info className="w-3 h-3" />
                            Condições avaliadas
                        </p>
                        <div className="space-y-2">
                            {detail.conditionResults.map((result, i) => (
                                <ConditionBadge key={result.conditionId || i} result={result} />
                            ))}
                        </div>
                    </div>

                    {/* Actions Applied */}
                    {detail.appliedActions && detail.appliedActions.length > 0 && (
                        <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                                <Zap className="w-3 h-3" />
                                Ações aplicadas
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {detail.appliedActions.map((action, i) => (
                                    <span
                                        key={i}
                                        className="inline-flex items-center px-2 py-1 rounded-lg text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                                    >
                                        {formatAction(action)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Stop on Match Warning */}
                    {detail.stoppedProcessing && (
                        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 rounded-lg flex items-center gap-1.5">
                            <Info className="w-3 h-3" />
                            Esta regra interrompeu o processamento (stop-on-match)
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * RuleMatchExplainer - Main component
 * 
 * Displays a popover/modal explaining why rules were applied to a payment.
 * Shows condition evaluations, matched values, and applied actions.
 */
export default function RuleMatchExplainer({
    details,
    fallbackNames,
    className,
    compact = false
}: RuleMatchExplainerProps) {
    const [isOpen, setIsOpen] = useState(false);

    // No rules matched
    if ((!details || details.length === 0) && (!fallbackNames || fallbackNames.length === 0)) {
        return null;
    }

    // Filter to only show rules that actually matched
    const matchedDetails = details?.filter(d => d.conditionResults.some(r => r.matched)) || [];

    // Compact mode: just show an icon with tooltip
    if (compact) {
        const tooltipText = matchedDetails.length > 0
            ? matchedDetails.map(d => `• ${d.ruleName}`).join('\n')
            : fallbackNames?.map(n => `• ${n}`).join('\n') || '';

        return (
            <span
                title={tooltipText}
                className={cn("text-purple-500 cursor-help", className)}
            >
                <Sparkles className="w-3.5 h-3.5" />
            </span>
        );
    }

    // Full mode: clickable icon that opens popover
    return (
        <div className={cn("relative inline-block", className)}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-1.5 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors",
                    "px-2 py-1 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20"
                )}
                title="Ver detalhes das regras aplicadas"
            >
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-medium">
                    {matchedDetails.length || fallbackNames?.length || 0} regra{(matchedDetails.length || fallbackNames?.length || 0) !== 1 ? 's' : ''}
                </span>
            </button>

            {/* Popover */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Content */}
                    <div className="absolute left-0 top-full mt-2 z-50 w-80 max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-top-1">
                        <div className="glass-panel border border-white/30 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-purple-50/50 dark:bg-purple-900/10">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-purple-500" />
                                    <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                                        Por que foi categorizado?
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-1 rounded-lg hover:bg-white/30 dark:hover:bg-white/10 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="p-3 max-h-80 overflow-y-auto space-y-2">
                                {matchedDetails.length > 0 ? (
                                    matchedDetails.map((detail, i) => (
                                        <RuleDetailCard
                                            key={detail.ruleId}
                                            detail={detail}
                                            defaultExpanded={i === 0}
                                        />
                                    ))
                                ) : fallbackNames && fallbackNames.length > 0 ? (
                                    <div className="text-sm text-gray-600 dark:text-gray-300 p-2">
                                        <p className="mb-2">Regras aplicadas:</p>
                                        <ul className="list-disc list-inside space-y-1">
                                            {fallbackNames.map((name, i) => (
                                                <li key={i}>{name}</li>
                                            ))}
                                        </ul>
                                        <p className="text-xs text-gray-400 mt-2">
                                            (Detalhes das condições não disponíveis)
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 dark:text-gray-400 p-2">
                                        Nenhuma regra foi aplicada.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
