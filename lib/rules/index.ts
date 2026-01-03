/**
 * Rules Module Index
 * 
 * Exports all public APIs from the rules module
 */

// Types
export type {
    RuleConditionOperator,
    RuleConditionField,
    RuleCondition,
    RuleActionType,
    RuleAction,
    ConditionLogic,
    AutoRule,
    CreateRulePayload,
    UpdateRulePayload,
    ConditionEvalResult,
    RuleMatchResult,
    RuleEngineResult,
    PaymentInput,
    TestRuleRequest,
    TestRuleResponse,
    RuleValidationError,
    RuleValidationResult,
} from './types';

export {
    RULE_MARKETPLACES,
    DEFAULT_RULE_MARKETPLACES,
    RULE_MARKETPLACE_LABELS,
    normalizeMarketplaces,
    isAllMarketplaces,
    type RuleMarketplace,
} from './marketplaces';

// Engine
export { RulesEngine, createRulesEngine, processPaymentWithRules } from './engine';

// Matcher
export {
    evaluateCondition,
    evaluateConditions,
    isOperatorValidForField,
    getOperatorsForField,
    OPERATOR_LABELS,
    FIELD_LABELS,
} from './matcher';

// Validator
export {
    validateRule,
    sanitizeRule,
    generateConditionId,
    normalizeConditionField,
    createEmptyCondition,
    createEmptyRule,
} from './validator';

// System Rules
export {
    SYSTEM_RULES,
    getSystemRules,
    isSystemRule,
    getSystemRule,
} from './system-rules';

// Cache
export {
    getCachedRules,
    setCachedRules,
    invalidateRulesCache,
    getCacheStats,
} from './cache';

// Import/Export
export {
    exportRules,
    exportRulesToJson,
    parseImportedRules,
    createRulesDownloadBlob,
    type RulesExport,
} from './import-export';

// Templates
export {
    RULE_TEMPLATES,
    TEMPLATE_CATEGORIES,
    getTemplatesByCategory,
    templateToPayload,
    type RuleTemplate,
} from './templates';
