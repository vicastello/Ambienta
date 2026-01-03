/**
 * Rule Templates
 * 
 * Pre-defined rule patterns for common marketplace categorization scenarios
 */

import type { CreateRulePayload } from './types';

export interface RuleTemplate {
    id: string;
    name: string;
    description: string;
    category: 'expenses' | 'adjustments' | 'income' | 'alerts';
    icon: string;  // Emoji for display
    marketplaces: string[];
    template: Omit<CreateRulePayload, 'name' | 'description' | 'marketplaces'>;
}

/**
 * Pre-defined rule templates organized by category
 */
export const RULE_TEMPLATES: RuleTemplate[] = [
    // ============================================
    // EXPENSES
    // ============================================
    {
        id: 'template_ads',
        name: 'Custos com Anúncios',
        description: 'Detecta gastos com publicidade e anúncios patrocinados',
        category: 'expenses',
        icon: '📢',
        marketplaces: ['shopee', 'mercado_livre', 'magalu'],
        template: {
            conditions: [
                {
                    id: 'cond_1',
                    field: 'full_text',
                    operator: 'regex',
                    value: 'anuncio|anúncio|publicidade|ads|patrocinado|impulsiona',
                },
            ],
            conditionLogic: 'OR',
            actions: [
                { type: 'add_tags', tags: ['anúncios', 'marketing'] },
                { type: 'mark_expense' },
                { type: 'set_category', category: 'anuncios' },
            ],
            priority: 70,
            enabled: true,
            stopOnMatch: false,
        },
    },
    {
        id: 'template_shipping',
        name: 'Custos de Frete',
        description: 'Identifica cobranças de frete e logística',
        category: 'expenses',
        icon: '🚚',
        marketplaces: ['shopee', 'mercado_livre', 'magalu'],
        template: {
            conditions: [
                {
                    id: 'cond_1',
                    field: 'full_text',
                    operator: 'regex',
                    value: 'frete|envio|entrega|logistica|shipping|transporte',
                },
            ],
            conditionLogic: 'OR',
            actions: [
                { type: 'add_tags', tags: ['frete'] },
                { type: 'mark_expense' },
                { type: 'set_category', category: 'frete' },
            ],
            priority: 65,
            enabled: true,
            stopOnMatch: false,
        },
    },
    {
        id: 'template_fees',
        name: 'Taxas e Comissões',
        description: 'Detecta taxas de marketplace, comissões e tarifas',
        category: 'expenses',
        icon: '💰',
        marketplaces: ['shopee', 'mercado_livre', 'magalu'],
        template: {
            conditions: [
                {
                    id: 'cond_1',
                    field: 'full_text',
                    operator: 'regex',
                    value: 'taxa|tarifa|comissao|comissão|fee|rate',
                },
            ],
            conditionLogic: 'OR',
            actions: [
                { type: 'add_tags', tags: ['taxas'] },
                { type: 'mark_expense' },
                { type: 'set_category', category: 'taxas' },
            ],
            priority: 60,
            enabled: true,
            stopOnMatch: false,
        },
    },
    {
        id: 'template_storage',
        name: 'Armazenagem',
        description: 'Custos de armazenamento em fulfillment',
        category: 'expenses',
        icon: '📦',
        marketplaces: ['shopee', 'mercado_livre', 'magalu'],
        template: {
            conditions: [
                {
                    id: 'cond_1',
                    field: 'full_text',
                    operator: 'regex',
                    value: 'armazen|storage|fulfillment|estoque|deposito|depósito',
                },
            ],
            conditionLogic: 'OR',
            actions: [
                { type: 'add_tags', tags: ['armazenagem', 'fulfillment'] },
                { type: 'mark_expense' },
                { type: 'set_category', category: 'armazenagem' },
            ],
            priority: 55,
            enabled: true,
            stopOnMatch: false,
        },
    },

    // ============================================
    // ADJUSTMENTS
    // ============================================
    {
        id: 'template_refund',
        name: 'Reembolsos e Devoluções',
        description: 'Identifica reembolsos, chargebacks e devoluções',
        category: 'adjustments',
        icon: '↩️',
        marketplaces: ['shopee', 'mercado_livre', 'magalu'],
        template: {
            conditions: [
                {
                    id: 'cond_1',
                    field: 'full_text',
                    operator: 'regex',
                    value: 'reembolso|devolucao|devolução|estorno|chargeback|reversa',
                },
            ],
            conditionLogic: 'OR',
            actions: [
                { type: 'add_tags', tags: ['reembolso'] },
            ],
            priority: 80,
            enabled: true,
            stopOnMatch: false,
        },
    },
    {
        id: 'template_adjustment',
        name: 'Ajustes Financeiros',
        description: 'Detecta ajustes, correções e compensações',
        category: 'adjustments',
        icon: '⚖️',
        marketplaces: ['shopee', 'mercado_livre', 'magalu'],
        template: {
            conditions: [
                {
                    id: 'cond_1',
                    field: 'full_text',
                    operator: 'regex',
                    value: 'ajuste|correcao|correção|compensacao|compensação|credito|crédito',
                },
            ],
            conditionLogic: 'OR',
            actions: [
                { type: 'add_tags', tags: ['ajuste'] },
            ],
            priority: 75,
            enabled: true,
            stopOnMatch: false,
        },
    },
    {
        id: 'template_withdrawal',
        name: 'Saques e Transferências',
        description: 'Identifica retiradas e transferências para conta',
        category: 'adjustments',
        icon: '🏦',
        marketplaces: ['shopee', 'mercado_livre', 'magalu'],
        template: {
            conditions: [
                {
                    id: 'cond_1',
                    field: 'full_text',
                    operator: 'regex',
                    value: 'saque|retirada|transfer|repasse|liberacao|liberação',
                },
            ],
            conditionLogic: 'OR',
            actions: [
                { type: 'add_tags', tags: ['saque', 'transferência'] },
            ],
            priority: 50,
            enabled: true,
            stopOnMatch: false,
        },
    },

    // ============================================
    // INCOME
    // ============================================
    {
        id: 'template_bonus',
        name: 'Bônus e Incentivos',
        description: 'Detecta bônus de vendedor, cashback e incentivos',
        category: 'income',
        icon: '🎁',
        marketplaces: ['shopee', 'mercado_livre', 'magalu'],
        template: {
            conditions: [
                {
                    id: 'cond_1',
                    field: 'full_text',
                    operator: 'regex',
                    value: 'bonus|bônus|incentivo|cashback|premio|prêmio|recompensa',
                },
            ],
            conditionLogic: 'OR',
            actions: [
                { type: 'add_tags', tags: ['bônus', 'incentivo'] },
                { type: 'mark_income' },
            ],
            priority: 70,
            enabled: true,
            stopOnMatch: false,
        },
    },

    // ============================================
    // ALERTS
    // ============================================
    {
        id: 'template_high_value',
        name: 'Valores Altos',
        description: 'Sinaliza transações acima de R$ 500 para revisão',
        category: 'alerts',
        icon: '⚠️',
        marketplaces: ['shopee', 'mercado_livre', 'magalu'],
        template: {
            conditions: [
                {
                    id: 'cond_1',
                    field: 'amount',
                    operator: 'greater_than',
                    value: 500,
                },
            ],
            conditionLogic: 'AND',
            actions: [
                { type: 'add_tags', tags: ['alto-valor'] },
                { type: 'flag_review', reviewNote: 'Valor acima de R$ 500' },
            ],
            priority: 90,
            enabled: true,
            stopOnMatch: false,
        },
    },
    {
        id: 'template_negative',
        name: 'Valores Negativos',
        description: 'Sinaliza qualquer transação negativa para análise',
        category: 'alerts',
        icon: '🔴',
        marketplaces: ['shopee', 'mercado_livre', 'magalu'],
        template: {
            conditions: [
                {
                    id: 'cond_1',
                    field: 'amount',
                    operator: 'less_than',
                    value: 0,
                },
            ],
            conditionLogic: 'AND',
            actions: [
                { type: 'add_tags', tags: ['negativo'] },
                { type: 'flag_review', reviewNote: 'Valor negativo - verificar' },
            ],
            priority: 85,
            enabled: true,
            stopOnMatch: false,
        },
    },
];

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: RuleTemplate['category']): RuleTemplate[] {
    return RULE_TEMPLATES.filter(t => t.category === category);
}

/**
 * Get all template categories
 */
export const TEMPLATE_CATEGORIES = [
    { id: 'expenses', name: 'Despesas', icon: '💸' },
    { id: 'adjustments', name: 'Ajustes', icon: '⚖️' },
    { id: 'income', name: 'Receitas', icon: '💵' },
    { id: 'alerts', name: 'Alertas', icon: '🔔' },
] as const;

/**
 * Convert a template to a CreateRulePayload
 */
export function templateToPayload(
    template: RuleTemplate,
    overrides?: Partial<CreateRulePayload>
): CreateRulePayload {
    return {
        name: template.name,
        description: template.description,
        marketplaces: template.marketplaces,
        ...template.template,
        ...overrides,
    };
}
