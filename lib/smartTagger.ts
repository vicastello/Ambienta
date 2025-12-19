/**
 * Smart Tagger Engine
 * 
 * Automatically detects and applies tags to payment transactions based on:
 * - Keywords in transaction descriptions
 * - Transaction types
 * - Auto-link rules from database
 */

export type TagRule = {
    pattern: string | RegExp;
    tags: string[];
    priority: number;
};

export type SmartTagResult = {
    tags: string[];
    isAdjustment: boolean;
    isRefund: boolean;
    matchedRules: string[];
};

/**
 * Built-in keyword patterns for common scenarios
 */
const BUILT_IN_PATTERNS: TagRule[] = [
    // Refunds
    { pattern: /reembolso/i, tags: ['reembolso'], priority: 100 },
    { pattern: /devolu[çc][ãa]o/i, tags: ['devolucao', 'reembolso'], priority: 100 },
    { pattern: /estorno/i, tags: ['estorno', 'reembolso'], priority: 100 },
    { pattern: /chargeback/i, tags: ['chargeback', 'reembolso'], priority: 100 },

    // Adjustments
    { pattern: /ajuste/i, tags: ['ajuste'], priority: 90 },
    { pattern: /compensa[çc][ãa]o/i, tags: ['compensacao', 'ajuste'], priority: 90 },
    { pattern: /corre[çc][ãa]o/i, tags: ['correcao', 'ajuste'], priority: 90 },

    // Fees & Costs
    { pattern: /taxa/i, tags: ['taxa'], priority: 80 },
    { pattern: /tarifa/i, tags: ['tarifa'], priority: 80 },
    { pattern: /comiss[ãa]o/i, tags: ['comissao'], priority: 80 },
    { pattern: /frete/i, tags: ['frete'], priority: 80 },
    { pattern: /MDR/i, tags: ['mdr', 'taxa'], priority: 80 },

    // Marketing & Ads
    { pattern: /an[úu]ncio/i, tags: ['anuncio', 'marketing'], priority: 70 },
    { pattern: /publicidade/i, tags: ['publicidade', 'marketing'], priority: 70 },
    { pattern: /promо[сç][ãa]o/i, tags: ['promocao', 'marketing'], priority: 70 },
    { pattern: /cupom/i, tags: ['cupom', 'desconto'], priority: 70 },

    // Withdrawals
    { pattern: /retirada/i, tags: ['retirada', 'saque'], priority: 60 },
    { pattern: /saque/i, tags: ['saque', 'retirada'], priority: 60 },
    { pattern: /transfer[êe]ncia/i, tags: ['transferencia'], priority: 60 },

    // Discounts
    { pattern: /desconto/i, tags: ['desconto'], priority: 50 },
    { pattern: /abatimento/i, tags: ['abatimento', 'desconto'], priority: 50 },
];

/**
 * Normalize text for pattern matching
 */
function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .trim();
}

/**
 * Apply smart tagging to a payment transaction
 */
export function applySmartTags(
    transactionDescription: string,
    transactionType?: string,
    customRules: TagRule[] = []
): SmartTagResult {
    const allTags = new Set<string>();
    const matchedRules: string[] = [];
    let isAdjustment = false;
    let isRefund = false;

    const normalizedDesc = normalizeText(transactionDescription);
    const normalizedType = transactionType ? normalizeText(transactionType) : '';
    const fullText = `${normalizedDesc} ${normalizedType}`;

    // Combine custom rules with built-in patterns
    const allRules = [...customRules, ...BUILT_IN_PATTERNS].sort((a, b) => b.priority - a.priority);

    // Apply each rule
    for (const rule of allRules) {
        const pattern = typeof rule.pattern === 'string'
            ? new RegExp(rule.pattern, 'i')
            : rule.pattern;

        if (pattern.test(fullText)) {
            rule.tags.forEach(tag => allTags.add(tag));
            matchedRules.push(pattern.source);

            // Set flags based on tag content
            if (rule.tags.some(t => ['reembolso', 'devolucao', 'estorno', 'chargeback'].includes(t))) {
                isRefund = true;
            }
            if (rule.tags.some(t => ['ajuste', 'compensacao', 'correcao'].includes(t))) {
                isAdjustment = true;
            }
        }
    }

    return {
        tags: Array.from(allTags),
        isAdjustment,
        isRefund,
        matchedRules,
    };
}

/**
 * Detect multi-entry scenarios
 * Groups payments by marketplace_order_id and identifies patterns
 */
export function detectMultiEntry(
    payments: Array<{
        marketplaceOrderId: string;
        amount: number;
        transactionDescription: string;
        balanceAfter?: number;
    }>
): Map<string, {
    orderIds: string[];
    netBalance: number;
    hasAdjustments: boolean;
    hasRefunds: boolean;
    transactionCount: number;
    suggestedTags: string[];
}> {
    const groups = new Map<string, typeof payments>();

    // Group by order ID
    payments.forEach(payment => {
        const orderId = payment.marketplaceOrderId;
        if (!groups.has(orderId)) {
            groups.set(orderId, []);
        }
        groups.get(orderId)!.push(payment);
    });

    // Analyze each group
    const results = new Map();

    for (const [orderId, groupPayments] of groups.entries()) {
        if (groupPayments.length === 1) continue; // Single entry, skip

        const netBalance = groupPayments.reduce((sum, p) => sum + p.amount, 0);
        const hasRefunds = groupPayments.some(p =>
            applySmartTags(p.transactionDescription).isRefund
        );
        const hasAdjustments = groupPayments.some(p =>
            applySmartTags(p.transactionDescription).isAdjustment
        );

        const suggestedTags = ['Entradas Múltiplas'];
        if (hasRefunds) suggestedTags.push('Possui Reembolso');
        if (hasAdjustments) suggestedTags.push('Possui Ajuste');
        if (Math.abs(netBalance) < 0.01) suggestedTags.push('Saldo Zero');

        results.set(orderId, {
            orderIds: groupPayments.map(p => p.marketplaceOrderId),
            netBalance,
            hasAdjustments,
            hasRefunds,
            transactionCount: groupPayments.length,
            suggestedTags,
        });
    }

    return results;
}

/**
 * Convert database auto-link rules to TagRule format
 */
export function convertDbRulesToTagRules(dbRules: Array<{
    transaction_type_pattern: string;
    tags: string[];
    priority: number;
}>): TagRule[] {
    return dbRules.map(rule => ({
        pattern: new RegExp(rule.transaction_type_pattern, 'i'),
        tags: rule.tags,
        priority: rule.priority,
    }));
}
