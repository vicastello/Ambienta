/**
 * Rule Matcher
 * 
 * Implements the logic for evaluating conditions against payment data
 */

import type {
    RuleCondition,
    RuleConditionOperator,
    RuleConditionField,
    ConditionEvalResult,
    PaymentInput,
} from './types';

/**
 * Normalize text for comparison (lowercase, remove accents)
 */
function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .trim();
}

/**
 * Get the value of a field from payment data
 */
function getFieldValue(field: RuleConditionField, payment: PaymentInput): string | number {
    switch (field) {
        case 'description':
            return payment.transactionDescription || '';
        case 'type':
            return payment.transactionType || '';
        case 'amount':
            return payment.amount;
        case 'order_id':
            return payment.marketplaceOrderId || '';
        case 'full_text':
            return `${payment.transactionDescription || ''} ${payment.transactionType || ''}`;
        default:
            return '';
    }
}

/**
 * Evaluate a text-based operator
 */
function evaluateTextOperator(
    operator: RuleConditionOperator,
    actualValue: string,
    expectedValue: string
): boolean {
    const normalizedActual = normalizeText(actualValue);
    const normalizedExpected = normalizeText(expectedValue);

    switch (operator) {
        case 'contains':
            return normalizedActual.includes(normalizedExpected);

        case 'not_contains':
            return !normalizedActual.includes(normalizedExpected);

        case 'equals':
            return normalizedActual === normalizedExpected;

        case 'not_equals':
            return normalizedActual !== normalizedExpected;

        case 'starts_with':
            return normalizedActual.startsWith(normalizedExpected);

        case 'ends_with':
            return normalizedActual.endsWith(normalizedExpected);

        case 'regex':
            try {
                const regex = new RegExp(expectedValue, 'i');
                return regex.test(actualValue);
            } catch {
                console.warn(`[RuleMatcher] Invalid regex: ${expectedValue}`);
                return false;
            }

        default:
            return false;
    }
}

/**
 * Evaluate a numeric operator
 */
function evaluateNumericOperator(
    operator: RuleConditionOperator,
    actualValue: number,
    expectedValue: number,
    expectedValue2?: number
): boolean {
    switch (operator) {
        case 'equals':
            return Math.abs(actualValue - expectedValue) < 0.01;

        case 'not_equals':
            return Math.abs(actualValue - expectedValue) >= 0.01;

        case 'greater_than':
            return actualValue > expectedValue;

        case 'less_than':
            return actualValue < expectedValue;

        case 'between':
            if (expectedValue2 === undefined) return false;
            return actualValue >= expectedValue && actualValue <= expectedValue2;

        default:
            return false;
    }
}

/**
 * Evaluate a single condition against payment data
 */
export function evaluateCondition(
    condition: RuleCondition,
    payment: PaymentInput
): ConditionEvalResult {
    const actualValue = getFieldValue(condition.field, payment);
    const expectedValue = condition.value;

    let matched: boolean;

    // Determine if this is a numeric or text comparison
    if (condition.field === 'amount' || typeof actualValue === 'number') {
        matched = evaluateNumericOperator(
            condition.operator,
            typeof actualValue === 'number' ? actualValue : parseFloat(String(actualValue)) || 0,
            typeof expectedValue === 'number' ? expectedValue : parseFloat(String(expectedValue)) || 0,
            condition.value2
        );
    } else {
        matched = evaluateTextOperator(
            condition.operator,
            String(actualValue),
            String(expectedValue)
        );
    }

    return {
        conditionId: condition.id,
        field: condition.field,
        operator: condition.operator,
        expectedValue,
        actualValue,
        matched,
    };
}

/**
 * Evaluate multiple conditions with AND/OR logic
 */
export function evaluateConditions(
    conditions: RuleCondition[],
    payment: PaymentInput,
    logic: 'AND' | 'OR'
): { matched: boolean; results: ConditionEvalResult[] } {
    if (conditions.length === 0) {
        return { matched: false, results: [] };
    }

    const results = conditions.map(condition => evaluateCondition(condition, payment));

    const matched = logic === 'AND'
        ? results.every(r => r.matched)
        : results.some(r => r.matched);

    return { matched, results };
}

/**
 * Check if an operator is valid for a given field type
 */
export function isOperatorValidForField(
    operator: RuleConditionOperator,
    field: RuleConditionField
): boolean {
    const numericOperators: RuleConditionOperator[] = ['greater_than', 'less_than', 'between'];
    const textOperators: RuleConditionOperator[] = ['contains', 'not_contains', 'starts_with', 'ends_with', 'regex'];
    const universalOperators: RuleConditionOperator[] = ['equals', 'not_equals'];

    if (field === 'amount') {
        return numericOperators.includes(operator) || universalOperators.includes(operator);
    }

    return textOperators.includes(operator) || universalOperators.includes(operator);
}

/**
 * Get available operators for a field
 */
export function getOperatorsForField(field: RuleConditionField): RuleConditionOperator[] {
    if (field === 'amount') {
        return ['equals', 'not_equals', 'greater_than', 'less_than', 'between'];
    }

    return ['contains', 'not_contains', 'equals', 'not_equals', 'starts_with', 'ends_with', 'regex'];
}

/**
 * Human-readable operator labels (Portuguese)
 */
export const OPERATOR_LABELS: Record<RuleConditionOperator, string> = {
    contains: 'contém',
    not_contains: 'não contém',
    equals: 'é igual a',
    not_equals: 'é diferente de',
    starts_with: 'começa com',
    ends_with: 'termina com',
    regex: 'corresponde ao padrão',
    greater_than: 'maior que',
    less_than: 'menor que',
    between: 'entre',
};

/**
 * Human-readable field labels (Portuguese)
 */
export const FIELD_LABELS: Record<RuleConditionField, string> = {
    description: 'Descrição',
    type: 'Tipo de transação',
    amount: 'Valor',
    order_id: 'ID do pedido',
    full_text: 'Texto completo',
};
