/**
 * Rules Import/Export
 * 
 * Functions to export and import rules as JSON for backup/sharing
 */

import type { AutoRule, CreateRulePayload } from './types';
import { validateRule } from './validator';
import { normalizeMarketplaces } from './marketplaces';

/**
 * Export format for rules
 */
export interface RulesExport {
    version: '1.0';
    exportedAt: string;
    marketplace?: string;
    rules: Array<Omit<AutoRule, 'id' | 'createdAt' | 'updatedAt'>>;
}

/**
 * Export rules to JSON format
 */
export function exportRules(rules: AutoRule[], marketplace?: string): RulesExport {
    return {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        marketplace,
        rules: rules
            .filter(r => !r.isSystemRule) // Don't export system rules
            .map(r => ({
                name: r.name,
                description: r.description,
                marketplaces: r.marketplaces,
                conditions: r.conditions,
                conditionLogic: r.conditionLogic,
                actions: r.actions,
                priority: r.priority,
                enabled: r.enabled,
                stopOnMatch: r.stopOnMatch,
                isSystemRule: false,
            })),
    };
}

/**
 * Convert exported rules to JSON string
 */
export function exportRulesToJson(rules: AutoRule[], marketplace?: string): string {
    return JSON.stringify(exportRules(rules, marketplace), null, 2);
}

/**
 * Parse and validate imported rules
 */
export function parseImportedRules(jsonString: string): {
    success: boolean;
    rules: CreateRulePayload[];
    errors: string[];
} {
    const errors: string[] = [];
    const validRules: CreateRulePayload[] = [];

    try {
        const data = JSON.parse(jsonString) as RulesExport;

        // Validate format
        if (!data.version || !data.rules || !Array.isArray(data.rules)) {
            return {
                success: false,
                rules: [],
                errors: ['Formato de arquivo inválido'],
            };
        }

        // Validate each rule
        data.rules.forEach((rule, index) => {
            const marketplaces = normalizeMarketplaces(
                Array.isArray((rule as any).marketplaces)
                    ? (rule as any).marketplaces
                    : (rule as any).marketplace || 'all'
            );

            const rulePayload: CreateRulePayload = {
                name: rule.name || `Regra Importada ${index + 1}`,
                description: rule.description,
                marketplaces,
                conditions: rule.conditions || [],
                conditionLogic: rule.conditionLogic || 'AND',
                actions: rule.actions || [],
                priority: rule.priority || 50,
                enabled: rule.enabled ?? true,
                stopOnMatch: rule.stopOnMatch ?? false,
            };

            const validation = validateRule(rulePayload);
            if (validation.valid) {
                validRules.push(rulePayload);
            } else {
                errors.push(`Regra ${index + 1} (${rule.name}): ${validation.errors.map(e => e.message).join(', ')}`);
            }
        });

        return {
            success: validRules.length > 0,
            rules: validRules,
            errors,
        };
    } catch (e) {
        return {
            success: false,
            rules: [],
            errors: ['Erro ao processar JSON: ' + (e instanceof Error ? e.message : 'erro desconhecido')],
        };
    }
}

/**
 * Create a downloadable blob from rules
 */
export function createRulesDownloadBlob(rules: AutoRule[], marketplace?: string): Blob {
    const json = exportRulesToJson(rules, marketplace);
    return new Blob([json], { type: 'application/json' });
}
