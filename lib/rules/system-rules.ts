/**
 * System Rules
 * 
 * Built-in rules that are always available (can be disabled but not deleted)
 */

import type { AutoRule } from './types';
import { DEFAULT_RULE_MARKETPLACES } from './marketplaces';

/**
 * Generate a stable ID for system rules
 */
function systemRuleId(name: string): string {
    return `system_${name.toLowerCase().replace(/\s+/g, '_')}`;
}

/**
 * Built-in system rules
 * These provide basic categorization that users can override or disable
 */
export const SYSTEM_RULES: AutoRule[] = [
    // =========================================================================
    // REFUNDS & CHARGEBACKS (Priority 100)
    // =========================================================================
    {
        id: systemRuleId('reembolso'),
        name: 'Reembolso',
        description: 'Detecta reembolsos, devoluções e estornos',
        marketplaces: DEFAULT_RULE_MARKETPLACES,
        conditions: [
            {
                id: 'cond_refund_1',
                field: 'full_text',
                operator: 'regex',
                value: 'reembolso|devolu[çc][ãa]o|estorno|chargeback',
            },
        ],
        conditionLogic: 'OR',
        actions: [{ type: 'add_tags', tags: ['reembolso'] }],
        priority: 100,
        enabled: true,
        stopOnMatch: false,
        isSystemRule: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    },

    // =========================================================================
    // ADJUSTMENTS (Priority 90)
    // =========================================================================
    {
        id: systemRuleId('ajuste'),
        name: 'Ajuste',
        description: 'Detecta ajustes, compensações e correções',
        marketplaces: DEFAULT_RULE_MARKETPLACES,
        conditions: [
            {
                id: 'cond_adjust_1',
                field: 'full_text',
                operator: 'regex',
                value: 'ajuste|compensa[çc][ãa]o|corre[çc][ãa]o',
            },
        ],
        conditionLogic: 'OR',
        actions: [{ type: 'add_tags', tags: ['ajuste'] }],
        priority: 90,
        enabled: true,
        stopOnMatch: false,
        isSystemRule: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    },

    // =========================================================================
    // MARKETING & ADS (Priority 85)
    // =========================================================================
    {
        id: systemRuleId('marketing_ads'),
        name: 'Marketing e ADS',
        description: 'Detecta gastos com publicidade e anúncios',
        marketplaces: DEFAULT_RULE_MARKETPLACES,
        conditions: [
            {
                id: 'cond_ads_1',
                field: 'full_text',
                operator: 'regex',
                value: 'ads|an[úu]ncio|publicidade|recarga.*compra.*ads',
            },
        ],
        conditionLogic: 'OR',
        actions: [
            { type: 'add_tags', tags: ['marketing', 'ads'] },
            { type: 'mark_expense' },
        ],
        priority: 85,
        enabled: true,
        stopOnMatch: false,
        isSystemRule: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    },

    // =========================================================================
    // FEES & COSTS (Priority 80)
    // =========================================================================
    {
        id: systemRuleId('taxas'),
        name: 'Taxas e Tarifas',
        description: 'Detecta taxas, tarifas e comissões',
        marketplaces: DEFAULT_RULE_MARKETPLACES,
        conditions: [
            {
                id: 'cond_fee_1',
                field: 'full_text',
                operator: 'regex',
                value: 'taxa|tarifa|comiss[ãa]o|mdr',
            },
        ],
        conditionLogic: 'OR',
        actions: [{ type: 'add_tags', tags: ['taxa'] }],
        priority: 80,
        enabled: true,
        stopOnMatch: false,
        isSystemRule: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    },
    {
        id: systemRuleId('frete'),
        name: 'Frete',
        description: 'Detecta cobranças de frete e envio',
        marketplaces: DEFAULT_RULE_MARKETPLACES,
        conditions: [
            {
                id: 'cond_frete_1',
                field: 'full_text',
                operator: 'contains',
                value: 'frete',
            },
        ],
        conditionLogic: 'OR',
        actions: [{ type: 'add_tags', tags: ['frete'] }],
        priority: 80,
        enabled: true,
        stopOnMatch: false,
        isSystemRule: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    },

    // =========================================================================
    // WITHDRAWALS (Priority 70)
    // =========================================================================
    {
        id: systemRuleId('saque'),
        name: 'Saque',
        description: 'Detecta saques, retiradas e transferências',
        marketplaces: DEFAULT_RULE_MARKETPLACES,
        conditions: [
            {
                id: 'cond_saque_1',
                field: 'full_text',
                operator: 'regex',
                value: 'saque|retirada|transfer[êe]ncia',
            },
        ],
        conditionLogic: 'OR',
        actions: [
            { type: 'add_tags', tags: ['saque', 'retirada'] },
            { type: 'mark_expense' },
        ],
        priority: 70,
        enabled: true,
        stopOnMatch: false,
        isSystemRule: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    },

    // =========================================================================
    // DISCOUNTS (Priority 60)
    // =========================================================================
    {
        id: systemRuleId('desconto'),
        name: 'Desconto',
        description: 'Detecta descontos e cupons',
        marketplaces: DEFAULT_RULE_MARKETPLACES,
        conditions: [
            {
                id: 'cond_desc_1',
                field: 'full_text',
                operator: 'regex',
                value: 'desconto|cupom|abatimento',
            },
        ],
        conditionLogic: 'OR',
        actions: [{ type: 'add_tags', tags: ['desconto'] }],
        priority: 60,
        enabled: true,
        stopOnMatch: false,
        isSystemRule: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    },
];

/**
 * Get all system rules
 */
export function getSystemRules(): AutoRule[] {
    return [...SYSTEM_RULES];
}

/**
 * Check if a rule ID is a system rule
 */
export function isSystemRule(ruleId: string): boolean {
    return ruleId.startsWith('system_');
}

/**
 * Get a system rule by ID
 */
export function getSystemRule(ruleId: string): AutoRule | undefined {
    return SYSTEM_RULES.find(r => r.id === ruleId);
}
