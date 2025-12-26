/**
 * Auto Rules Type Definitions
 * 
 * Professional SaaS-grade rules engine for automatic payment categorization
 */

// ============================================================================
// CONDITION TYPES
// ============================================================================

/**
 * Available operators for rule conditions
 */
export type RuleConditionOperator =
    | 'contains'        // Text contains value (case-insensitive)
    | 'not_contains'    // Text does NOT contain value
    | 'equals'          // Exact match (case-insensitive)
    | 'not_equals'      // Not equal
    | 'starts_with'     // Text starts with value
    | 'ends_with'       // Text ends with value
    | 'regex'           // Regular expression match
    | 'greater_than'    // Number greater than
    | 'less_than'       // Number less than
    | 'between';        // Number between two values

/**
 * Fields that can be used in conditions
 */
export type RuleConditionField =
    | 'description'     // transactionDescription
    | 'type'            // transactionType
    | 'amount'          // Payment amount
    | 'order_id'        // Marketplace order ID
    | 'full_text';      // Combined description + type

/**
 * A single condition in a rule
 */
export interface RuleCondition {
    id: string;                         // Unique ID for UI tracking
    field: RuleConditionField;          // Field to check
    operator: RuleConditionOperator;    // How to compare
    value: string | number;             // Value to compare against
    value2?: number;                    // Second value for 'between' operator
}

// ============================================================================
// ACTION TYPES
// ============================================================================

/**
 * Types of actions that can be performed when a rule matches
 */
export type RuleActionType =
    | 'add_tags'        // Add tags to the payment
    | 'set_type'        // Set/override transaction type
    | 'set_description' // Set/override transaction description
    | 'set_category'    // Set expense category
    | 'mark_expense'    // Mark as expense (outgoing)
    | 'mark_income'     // Mark as income (incoming)
    | 'skip'            // Skip this payment during import
    | 'flag_review';    // Flag for manual review

/**
 * A single action to perform when rule matches
 */
export interface RuleAction {
    type: RuleActionType;
    tags?: string[];            // For add_tags
    transactionType?: string;   // For set_type
    description?: string;       // For set_description  
    category?: string;          // For set_category
    reviewNote?: string;        // For flag_review
}

// ============================================================================
// RULE DEFINITION
// ============================================================================

/**
 * Logic to use between multiple conditions
 */
export type ConditionLogic = 'AND' | 'OR';

/**
 * Complete rule definition
 */
export interface AutoRule {
    id: string;
    name: string;                           // Human-readable name
    description?: string;                   // Optional description
    marketplace: string;                    // 'shopee', 'mercado_livre', etc. or 'all'
    conditions: RuleCondition[];            // Conditions to evaluate
    conditionLogic: ConditionLogic;         // How to combine conditions
    actions: RuleAction[];                  // Actions to perform on match
    priority: number;                       // Higher = runs first (1-100)
    enabled: boolean;                       // Can be disabled without deleting
    stopOnMatch: boolean;                   // Stop processing more rules after match?
    isSystemRule: boolean;                  // Built-in rule (can't be deleted)
    createdAt: string;                      // ISO date string
    updatedAt: string;                      // ISO date string
}

/**
 * Rule creation payload (without system fields)
 */
export type CreateRulePayload = Omit<AutoRule, 'id' | 'createdAt' | 'updatedAt' | 'isSystemRule'>;

/**
 * Rule update payload (partial)
 */
export type UpdateRulePayload = Partial<Omit<AutoRule, 'id' | 'createdAt' | 'isSystemRule'>>;

// ============================================================================
// ENGINE RESULTS
// ============================================================================

/**
 * Result of evaluating a single condition
 */
export interface ConditionEvalResult {
    conditionId: string;
    field: RuleConditionField;
    operator: RuleConditionOperator;
    expectedValue: string | number;
    actualValue: string | number;
    matched: boolean;
}

/**
 * Result of evaluating a single rule
 */
export interface RuleMatchResult {
    ruleId: string;
    ruleName: string;
    matched: boolean;
    conditionResults: ConditionEvalResult[];
    matchedConditions: number;
    totalConditions: number;
    appliedActions: RuleAction[];
    stoppedProcessing: boolean;             // Did this rule stop further processing?
}

/**
 * Final result from the rules engine
 */
export interface RuleEngineResult {
    // Applied results
    tags: string[];
    transactionType?: string;           // Modified transaction type
    transactionDescription?: string;    // Modified description
    category?: string;
    isExpense: boolean;
    isIncome: boolean;
    skipped: boolean;
    flaggedForReview: boolean;
    reviewNote?: string;

    // Debug info
    matchedRules: RuleMatchResult[];
    totalRulesEvaluated: number;
    processingTimeMs: number;
}

// ============================================================================
// PAYMENT INPUT
// ============================================================================

/**
 * Payment data that the engine processes
 */
export interface PaymentInput {
    marketplaceOrderId: string;
    transactionDescription: string;
    transactionType: string;
    amount: number;
    paymentDate: string;
}

// ============================================================================
// API TYPES
// ============================================================================

/**
 * Request to test a rule against sample data
 */
export interface TestRuleRequest {
    rule: CreateRulePayload;
    testPayments: PaymentInput[];
}

/**
 * Response from testing a rule
 */
export interface TestRuleResponse {
    results: Array<{
        payment: PaymentInput;
        matchResult: RuleMatchResult;
    }>;
    matchCount: number;
    totalTested: number;
}

/**
 * Validation error for a rule
 */
export interface RuleValidationError {
    field: string;
    message: string;
    code: 'REQUIRED' | 'INVALID_REGEX' | 'INVALID_VALUE' | 'DUPLICATE_NAME';
}

/**
 * Result of rule validation
 */
export interface RuleValidationResult {
    valid: boolean;
    errors: RuleValidationError[];
}
