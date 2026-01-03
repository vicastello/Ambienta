'use client';

import { useState, useCallback } from 'react';
import { Sparkles, Plus, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    RULE_TEMPLATES,
    TEMPLATE_CATEGORIES,
    getTemplatesByCategory,
    templateToPayload,
    type RuleTemplate,
    type CreateRulePayload,
} from '@/lib/rules';

interface RuleTemplateSelectorProps {
    onSelectTemplate: (payload: CreateRulePayload) => void;
    className?: string;
}

/**
 * RuleTemplateSelector - UI for browsing and selecting rule templates
 */
export default function RuleTemplateSelector({
    onSelectTemplate,
    className,
}: RuleTemplateSelectorProps) {
    const [selectedCategory, setSelectedCategory] = useState<string>('expenses');
    const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);

    const templates = getTemplatesByCategory(selectedCategory as RuleTemplate['category']);

    const handleSelectTemplate = useCallback((template: RuleTemplate) => {
        const payload = templateToPayload(template);
        onSelectTemplate(payload);
    }, [onSelectTemplate]);

    return (
        <div className={cn("space-y-4", className)}>
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30">
                    <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                        Templates de Regras
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Comece com padrões pré-definidos
                    </p>
                </div>
            </div>

            {/* Category tabs */}
            <div className="flex gap-1 bg-white/50 dark:bg-white/5 rounded-xl p-1">
                {TEMPLATE_CATEGORIES.map((category) => (
                    <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                            selectedCategory === category.id
                                ? 'bg-white dark:bg-gray-700 shadow-sm font-medium'
                                : 'hover:bg-white/50 dark:hover:bg-white/10 text-gray-600 dark:text-gray-400'
                        )}
                    >
                        <span>{category.icon}</span>
                        <span className="hidden sm:inline">{category.name}</span>
                    </button>
                ))}
            </div>

            {/* Template grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {templates.map((template) => (
                    <div
                        key={template.id}
                        className={cn(
                            "relative p-4 rounded-xl border transition-all cursor-pointer group",
                            hoveredTemplate === template.id
                                ? "bg-white dark:bg-gray-800 border-blue-300 dark:border-blue-600 shadow-lg"
                                : "bg-white/60 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-700"
                        )}
                        onMouseEnter={() => setHoveredTemplate(template.id)}
                        onMouseLeave={() => setHoveredTemplate(null)}
                        onClick={() => handleSelectTemplate(template)}
                    >
                        <div className="flex items-start gap-3">
                            <span className="text-2xl">{template.icon}</span>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-slate-800 dark:text-slate-100">
                                    {template.name}
                                </h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                    {template.description}
                                </p>
                            </div>
                            <div className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                hoveredTemplate === template.id
                                    ? "bg-blue-500 text-white"
                                    : "bg-gray-100 dark:bg-gray-700 text-gray-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 group-hover:text-blue-500"
                            )}>
                                <Plus className="w-4 h-4" />
                            </div>
                        </div>

                        {/* Template details on hover */}
                        {hoveredTemplate === template.id && (
                            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs space-y-2">
                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                    <span className="font-medium">Condição:</span>
                                    <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700">
                                        {template.template.conditions[0]?.operator === 'regex'
                                            ? `/${template.template.conditions[0]?.value}/`
                                            : template.template.conditions[0]?.value}
                                    </code>
                                </div>
                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                    <span className="font-medium">Ações:</span>
                                    <div className="flex flex-wrap gap-1">
                                        {template.template.actions.map((action, i) => (
                                            <span
                                                key={i}
                                                className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                            >
                                                {action.type === 'add_tags' && `+${action.tags?.join(', ')}`}
                                                {action.type === 'mark_expense' && '💸 Despesa'}
                                                {action.type === 'mark_income' && '💵 Receita'}
                                                {action.type === 'flag_review' && '🔍 Revisão'}
                                                {action.type === 'set_category' && `📁 ${action.category}`}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-gray-500">
                                    <span>Prioridade: {template.template.priority}</span>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 text-xs text-gray-500">
                <span>{RULE_TEMPLATES.length} templates disponíveis</span>
                <button
                    onClick={() => { }}
                    className="flex items-center gap-1 text-blue-500 hover:underline"
                >
                    Ver todos
                    <ChevronRight className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}
