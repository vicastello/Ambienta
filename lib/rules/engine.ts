/**
 * Rules Engine
 * 
 * Main engine that processes payments against rules and returns results
 */

import type {
    AutoRule,
    PaymentInput,
    RuleEngineResult,
    RuleMatchResult,
    RuleAction,
} from './types';
import { evaluateConditions } from './matcher';

/**
 * Rules Engine Class
 * 
 * Processes payments against a set of rules and applies actions
 */
export class RulesEngine {
    private rules: AutoRule[] = [];
    private cache: Map<string, RuleEngineResult> = new Map();
    private cacheEnabled: boolean = true;

    /**
     * Create a new rules engine
     * @param rules - Array of rules to use (will be sorted by priority)
     */
    constructor(rules: AutoRule[] = []) {
        this.setRules(rules);
    }

    /**
     * Update the rules used by the engine
     */
    setRules(rules: AutoRule[]): void {
        // Filter enabled rules and sort by priority (highest first)
        this.rules = rules
            .filter(r => r.enabled)
            .sort((a, b) => b.priority - a.priority);

        // Clear cache when rules change
        this.cache.clear();
    }

    /**
     * Enable or disable caching
     */
    setCacheEnabled(enabled: boolean): void {
        this.cacheEnabled = enabled;
        if (!enabled) {
            this.cache.clear();
        }
    }

    /**
     * Clear the cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Generate a cache key for a payment
     */
    private getCacheKey(payment: PaymentInput): string {
        return `${payment.marketplaceOrderId}:${payment.transactionDescription}:${payment.transactionType}:${payment.amount}`;
    }

    /**
     * Process a single payment through all rules
     */
    process(payment: PaymentInput, marketplace: string = 'all'): RuleEngineResult {
        const startTime = performance.now();
        const targetMarketplace = marketplace?.toLowerCase() || 'all';

        // Check cache
        if (this.cacheEnabled) {
            const cacheKey = this.getCacheKey(payment);
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return { ...cached, processingTimeMs: 0 };
            }
        }

        // Initialize result
        const result: RuleEngineResult = {
            tags: [],
            category: undefined,
            isExpense: false,
            isIncome: false,
            skipped: false,
            flaggedForReview: false,
            reviewNote: undefined,
            matchedRules: [],
            totalRulesEvaluated: 0,
            processingTimeMs: 0,
        };

        // Get applicable rules (matching marketplace or 'all')
        const applicableRules = this.rules.filter((rule) => {
            if (!rule.marketplaces || rule.marketplaces.length === 0) return true;
            if (targetMarketplace === 'all') return true;
            return rule.marketplaces.includes(targetMarketplace);
        });

        // Process each rule
        for (const rule of applicableRules) {
            result.totalRulesEvaluated++;

            const matchResult = this.evaluateRule(rule, payment);
            result.matchedRules.push(matchResult);

            if (matchResult.matched) {
                // Apply actions
                this.applyActions(rule.actions, result);

                // Stop if rule says to
                if (rule.stopOnMatch) {
                    break;
                }
            }
        }

        // Calculate processing time
        result.processingTimeMs = performance.now() - startTime;

        // Cache result
        if (this.cacheEnabled) {
            this.cache.set(this.getCacheKey(payment), result);
        }

        return result;
    }

    /**
     * Process multiple payments (batch processing)
     */
    processBatch(payments: PaymentInput[], marketplace: string = 'all'): Map<string, RuleEngineResult> {
        const results = new Map<string, RuleEngineResult>();

        for (const payment of payments) {
            const key = payment.marketplaceOrderId || this.getCacheKey(payment);
            results.set(key, this.process(payment, marketplace));
        }

        return results;
    }

    /**
     * Evaluate a single rule against a payment
     */
    private evaluateRule(rule: AutoRule, payment: PaymentInput): RuleMatchResult {
        const { matched, results } = evaluateConditions(
            rule.conditions,
            payment,
            rule.conditionLogic
        );

        return {
            ruleId: rule.id,
            ruleName: rule.name,
            matched,
            conditionResults: results,
            matchedConditions: results.filter(r => r.matched).length,
            totalConditions: results.length,
            appliedActions: matched ? rule.actions : [],
            stoppedProcessing: matched && rule.stopOnMatch,
        };
    }

    /**
     * Apply rule actions to the result
     */
    private applyActions(actions: RuleAction[], result: RuleEngineResult): void {
        for (const action of actions) {
            switch (action.type) {
                case 'add_tags':
                    if (action.tags) {
                        action.tags.forEach(tag => {
                            if (!result.tags.includes(tag)) {
                                result.tags.push(tag);
                            }
                        });
                    }
                    break;

                case 'set_type':
                    if (action.transactionType) {
                        result.transactionType = action.transactionType;
                    }
                    break;

                case 'set_description':
                    if (action.description) {
                        result.transactionDescription = action.description;
                    }
                    break;

                case 'set_category':
                    if (action.category) {
                        result.category = action.category;
                    }
                    break;

                case 'mark_expense':
                    result.isExpense = true;
                    result.isIncome = false;
                    break;

                case 'mark_income':
                    result.isIncome = true;
                    result.isExpense = false;
                    break;

                case 'skip':
                    result.skipped = true;
                    break;

                case 'flag_review':
                    result.flaggedForReview = true;
                    result.reviewNote = action.reviewNote;
                    break;
            }
        }
    }

    /**
     * Get statistics about loaded rules
     */
    getStats(): { totalRules: number; byMarketplace: Record<string, number> } {
        const byMarketplace: Record<string, number> = {};

        for (const rule of this.rules) {
            if (!rule.marketplaces || rule.marketplaces.length === 0) {
                byMarketplace.all = (byMarketplace.all || 0) + 1;
                continue;
            }
            rule.marketplaces.forEach((mp) => {
                byMarketplace[mp] = (byMarketplace[mp] || 0) + 1;
            });
        }

        return {
            totalRules: this.rules.length,
            byMarketplace,
        };
    }

    /**
     * Get all loaded rules
     */
    getRules(): AutoRule[] {
        return [...this.rules];
    }
}

/**
 * Create a pre-configured engine instance with rules
 */
export function createRulesEngine(rules: AutoRule[]): RulesEngine {
    return new RulesEngine(rules);
}

/**
 * Single-use function to process a payment against rules
 * (For when you don't need to reuse the engine)
 */
export function processPaymentWithRules(
    payment: PaymentInput,
    rules: AutoRule[],
    marketplace: string = 'all'
): RuleEngineResult {
    const engine = new RulesEngine(rules);
    return engine.process(payment, marketplace);
}
