/**
 * Rule Validator
 * 
 * Validates rule definitions before saving to database
 */

import type {
    AutoRule,
    CreateRulePayload,
    RuleValidationError,
    RuleValidationResult,
    RuleCondition,
} from './types';

/**
 * Validate a regex pattern
 */
function isValidRegex(pattern: string): boolean {
    try {
        new RegExp(pattern);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate a single condition
 */
function validateCondition(
    condition: RuleCondition,
    index: number
): RuleValidationError[] {
    const errors: RuleValidationError[] = [];
    const prefix = `conditions[${index}]`;

    // Check required fields
    if (!condition.field) {
        errors.push({
            field: `${prefix}.field`,
            message: 'Campo é obrigatório',
            code: 'REQUIRED',
        });
    }

    if (!condition.operator) {
        errors.push({
            field: `${prefix}.operator`,
            message: 'Operador é obrigatório',
            code: 'REQUIRED',
        });
    }

    if (condition.value === undefined || condition.value === null || condition.value === '') {
        errors.push({
            field: `${prefix}.value`,
            message: 'Valor é obrigatório',
            code: 'REQUIRED',
        });
    }

    // Validate regex if operator is 'regex'
    if (condition.operator === 'regex' && typeof condition.value === 'string') {
        if (!isValidRegex(condition.value)) {
            errors.push({
                field: `${prefix}.value`,
                message: 'Expressão regular inválida',
                code: 'INVALID_REGEX',
            });
        }
    }

    // Validate 'between' operator has value2
    if (condition.operator === 'between' && condition.value2 === undefined) {
        errors.push({
            field: `${prefix}.value2`,
            message: 'Segundo valor é obrigatório para operador "entre"',
            code: 'REQUIRED',
        });
    }

    // Validate numeric operators have numeric values
    const numericOperators = ['greater_than', 'less_than', 'between'];
    if (numericOperators.includes(condition.operator)) {
        if (typeof condition.value !== 'number' && isNaN(Number(condition.value))) {
            errors.push({
                field: `${prefix}.value`,
                message: 'Valor deve ser numérico para este operador',
                code: 'INVALID_VALUE',
            });
        }
    }

    return errors;
}

/**
 * Validate a complete rule
 */
export function validateRule(rule: CreateRulePayload | AutoRule): RuleValidationResult {
    const errors: RuleValidationError[] = [];

    // Required fields
    if (!rule.name || rule.name.trim() === '') {
        errors.push({
            field: 'name',
            message: 'Nome da regra é obrigatório',
            code: 'REQUIRED',
        });
    }

    if (rule.name && rule.name.length > 100) {
        errors.push({
            field: 'name',
            message: 'Nome da regra deve ter no máximo 100 caracteres',
            code: 'INVALID_VALUE',
        });
    }

    if (!rule.marketplace) {
        errors.push({
            field: 'marketplace',
            message: 'Marketplace é obrigatório',
            code: 'REQUIRED',
        });
    }

    // Validate conditions
    if (!rule.conditions || rule.conditions.length === 0) {
        errors.push({
            field: 'conditions',
            message: 'Pelo menos uma condição é obrigatória',
            code: 'REQUIRED',
        });
    } else {
        rule.conditions.forEach((condition, index) => {
            errors.push(...validateCondition(condition, index));
        });
    }

    // Validate actions
    if (!rule.actions || rule.actions.length === 0) {
        errors.push({
            field: 'actions',
            message: 'Pelo menos uma ação é obrigatória',
            code: 'REQUIRED',
        });
    } else {
        rule.actions.forEach((action, index) => {
            if (!action.type) {
                errors.push({
                    field: `actions[${index}].type`,
                    message: 'Tipo de ação é obrigatório',
                    code: 'REQUIRED',
                });
            }

            if (action.type === 'add_tags' && (!action.tags || action.tags.length === 0)) {
                errors.push({
                    field: `actions[${index}].tags`,
                    message: 'Pelo menos uma tag é obrigatória para ação "adicionar tags"',
                    code: 'REQUIRED',
                });
            }

            if (action.type === 'set_category' && !action.category) {
                errors.push({
                    field: `actions[${index}].category`,
                    message: 'Categoria é obrigatória para ação "definir categoria"',
                    code: 'REQUIRED',
                });
            }
        });
    }

    // Validate priority
    if (rule.priority !== undefined) {
        if (rule.priority < 1 || rule.priority > 100) {
            errors.push({
                field: 'priority',
                message: 'Prioridade deve estar entre 1 e 100',
                code: 'INVALID_VALUE',
            });
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Sanitize rule data before saving
 */
export function sanitizeRule(rule: CreateRulePayload): CreateRulePayload {
    return {
        ...rule,
        name: rule.name.trim(),
        description: rule.description?.trim(),
        marketplace: rule.marketplace.toLowerCase(),
        conditions: rule.conditions.map(c => ({
            ...c,
            value: typeof c.value === 'string' ? c.value.trim() : c.value,
        })),
        actions: rule.actions.map(a => ({
            ...a,
            tags: a.tags?.map(t => t.trim().toLowerCase()),
            category: a.category?.trim(),
        })),
        priority: Math.max(1, Math.min(100, rule.priority || 50)),
        enabled: rule.enabled ?? true,
        stopOnMatch: rule.stopOnMatch ?? false,
    };
}

/**
 * Generate a unique ID for conditions
 */
export function generateConditionId(): string {
    return `cond_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a default empty condition
 */
export function createEmptyCondition(): RuleCondition {
    return {
        id: generateConditionId(),
        field: 'description',
        operator: 'contains',
        value: '',
    };
}

/**
 * Create a default empty rule
 */
export function createEmptyRule(): CreateRulePayload {
    return {
        name: '',
        description: '',
        marketplace: 'all',
        conditions: [createEmptyCondition()],
        conditionLogic: 'AND',
        actions: [{ type: 'add_tags', tags: [] }],
        priority: 50,
        enabled: true,
        stopOnMatch: false,
    };
}
