/**
 * Auto Rules API
 * 
 * Professional CRUD endpoints for the new rules engine
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
    validateRule,
    sanitizeRule,
    isSystemRule,
    getSystemRules,
    normalizeMarketplaces,
    normalizeConditionField,
    type AutoRule,
    type CreateRulePayload,
} from '@/lib/rules';

/**
 * Convert database row to AutoRule type
 */
function dbRowToRule(row: any): AutoRule {
    const normalizedConditions = Array.isArray(row.conditions)
        ? row.conditions.map((condition: any) => ({
            ...condition,
            field: normalizeConditionField(String(condition.field || '')),
        }))
        : [];

    return {
        id: row.id,
        name: row.name,
        description: row.description,
        marketplaces: normalizeMarketplaces(row.marketplaces ?? row.marketplace),
        conditions: normalizedConditions,
        conditionLogic: row.condition_logic || 'AND',
        actions: row.actions || [],
        priority: row.priority,
        enabled: row.enabled,
        stopOnMatch: row.stop_on_match,
        isSystemRule: row.is_system_rule,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        // Metrics
        matchCount: row.match_count || 0,
        lastAppliedAt: row.last_applied_at || null,
        totalImpact: row.total_impact || 0,
        // Versioning
        version: row.version || 1,
        status: row.status || 'published',
        publishedAt: row.published_at || null,
        hasDraft: row.draft_data !== null && row.draft_data !== undefined,
    };
}

/**
 * Convert AutoRule to database row format
 */
function ruleToDbRow(rule: CreateRulePayload): any {
    return {
        name: rule.name,
        description: rule.description,
        marketplaces: normalizeMarketplaces(rule.marketplaces),
        conditions: rule.conditions,
        condition_logic: rule.conditionLogic,
        actions: rule.actions,
        priority: rule.priority,
        enabled: rule.enabled,
        stop_on_match: rule.stopOnMatch,
        is_system_rule: false,
    };
}

const normalizeText = (text: string): string => {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
};

const normalizeConditionValue = (value: any, operator?: string) => {
    if (value === null || value === undefined) return value;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        if (operator === 'regex') return value.trim();
        const asNumber = Number(value);
        if (!Number.isNaN(asNumber) && value.trim() !== '') return asNumber;
        return normalizeText(value);
    }
    return value;
};

const normalizeConditions = (conditions: any[]) => {
    if (!Array.isArray(conditions)) return [];
    return conditions
        .map((condition) => ({
            field: normalizeConditionField(String(condition.field || '')),
            operator: condition.operator,
            value: normalizeConditionValue(condition.value, condition.operator),
            value2: normalizeConditionValue(condition.value2, condition.operator),
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
};

const normalizeActions = (actions: any[]) => {
    if (!Array.isArray(actions)) return [];
    return actions
        .map((action) => {
            const base: any = { type: action.type };
            if (action.tags) base.tags = [...action.tags].map((tag: string) => normalizeText(tag)).sort();
            if (action.transactionType) base.transactionType = normalizeText(action.transactionType);
            if (action.category) base.category = normalizeText(action.category);
            if (action.description) base.description = normalizeText(action.description);
            return base;
        })
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
};

const buildRuleSignature = (rule: {
    conditionLogic?: string;
    condition_logic?: string;
    conditions?: any[];
}) => {
    const conditionLogic = (rule.conditionLogic || rule.condition_logic || 'AND').toUpperCase();
    return JSON.stringify({
        conditionLogic,
        conditions: normalizeConditions(rule.conditions || []),
    });
};

const buildActionsSignature = (rule: { actions?: any[] }) => {
    return JSON.stringify(normalizeActions(rule.actions || []));
};

const marketplacesOverlap = (a: string[], b: string[]) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    return a.some((marketplace) => b.includes(marketplace));
};

const mergeMarketplaces = (a: string[], b: string[]) => {
    return normalizeMarketplaces([...(a || []), ...(b || [])]);
};

// ============================================================================
// GET - List all rules
// ============================================================================
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const marketplace = searchParams.get('marketplace')?.toLowerCase() || null;
        const enabledOnly = searchParams.get('enabled') === 'true';

        let query = (supabaseAdmin as any)
            .from('auto_rules' as any)
            .select('*')
            .order('priority', { ascending: false });

        if (enabledOnly) {
            query = query.eq('enabled', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[AutoRules] Error fetching rules:', error);
            return NextResponse.json(
                { success: false, error: 'Erro ao buscar regras' },
                { status: 500 }
            );
        }

        let dbRules: AutoRule[] = (data || []).map(dbRowToRule);

        if (marketplace && marketplace !== 'all') {
            dbRules = dbRules.filter((rule) => rule.marketplaces.includes(marketplace));
        }

        // Merge database rules with system rules
        let systemRules = getSystemRules();
        if (marketplace && marketplace !== 'all') {
            systemRules = systemRules.filter((rule) => rule.marketplaces.includes(marketplace));
        }
        const allRules = [...dbRules, ...systemRules].sort((a, b) => b.priority - a.priority);

        return NextResponse.json({
            success: true,
            rules: allRules,
            count: allRules.length,
            dbCount: dbRules.length,
            systemCount: systemRules.length,
        });
    } catch (error) {
        console.error('[AutoRules] Unexpected error:', error);
        return NextResponse.json(
            { success: false, error: 'Erro interno' },
            { status: 500 }
        );
    }
}

// ============================================================================
// POST - Create new rule
// ============================================================================
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const rulePayload = {
            ...body,
            marketplaces: normalizeMarketplaces(body.marketplaces ?? body.marketplace),
        } as CreateRulePayload;

        // Validate
        const validation = validateRule(rulePayload);
        if (!validation.valid) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Validação falhou',
                    validationErrors: validation.errors,
                },
                { status: 400 }
            );
        }

        // Sanitize
        const sanitized = sanitizeRule(rulePayload);
        const dbRow = ruleToDbRow(sanitized);

        // Conflict check (enabled rules only)
        const { data: existingRows, error: existingError } = await (supabaseAdmin as any)
            .from('auto_rules' as any)
            .select('*')
            .eq('enabled', true);

        if (existingError) {
            console.error('[AutoRules] Error checking conflicts:', existingError);
            return NextResponse.json(
                { success: false, error: 'Erro ao validar conflito de regras' },
                { status: 500 }
            );
        }

        const systemRules = getSystemRules().filter((r) => r.enabled);
        const existingRules = (existingRows || []).map(dbRowToRule);
        const allExisting = [...existingRules, ...systemRules];

        const candidateSignature = buildRuleSignature(sanitized);
        const candidateActions = buildActionsSignature(sanitized);
        const candidateMarketplaces = normalizeMarketplaces(sanitized.marketplaces);

        const duplicate = allExisting.find((rule) => {
            if (!rule.enabled) return false;
            const signature = buildRuleSignature(rule);
            if (signature !== candidateSignature) return false;
            return buildActionsSignature(rule) === candidateActions;
        });

        if (duplicate) {
            if (duplicate.isSystemRule) {
                return NextResponse.json(
                    {
                        success: false,
                        error: 'Conflito: regra do sistema com as mesmas condições já existe.',
                        conflict: {
                            type: 'system-duplicate',
                            rule: duplicate,
                        },
                    },
                    { status: 409 }
                );
            }

            const mergedMarketplaces = mergeMarketplaces(duplicate.marketplaces, candidateMarketplaces);
            if (mergedMarketplaces.length !== duplicate.marketplaces.length) {
                const { data: merged, error: mergeError } = await (supabaseAdmin as any)
                    .from('auto_rules' as any)
                    .update({ marketplaces: mergedMarketplaces })
                    .eq('id', duplicate.id)
                    .select()
                    .single();

                if (mergeError) {
                    console.error('[AutoRules] Error merging marketplaces:', mergeError);
                    return NextResponse.json(
                        { success: false, error: 'Erro ao combinar marketplaces da regra' },
                        { status: 500 }
                    );
                }

                return NextResponse.json({
                    success: true,
                    merged: true,
                    rule: dbRowToRule(merged),
                });
            }

            return NextResponse.json({
                success: true,
                merged: false,
                rule: duplicate,
            });
        }

        const conflict = allExisting.find((rule) => {
            if (!rule.enabled) return false;
            if (!marketplacesOverlap(rule.marketplaces, candidateMarketplaces)) return false;
            const signature = buildRuleSignature(rule);
            if (signature !== candidateSignature) return false;
            return buildActionsSignature(rule) !== candidateActions;
        });

        if (conflict) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Conflito: já existe uma regra ativa com as mesmas condições e ações diferentes.',
                    conflict: {
                        type: 'conflict',
                        rule: conflict,
                    },
                },
                { status: 409 }
            );
        }

        // Insert
        const { data, error } = await (supabaseAdmin as any)
            .from('auto_rules' as any)
            .insert(dbRow)
            .select()
            .single();

        if (error) {
            console.error('[AutoRules] Error creating rule:', error);
            return NextResponse.json(
                { success: false, error: 'Erro ao criar regra' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            rule: dbRowToRule(data),
        });
    } catch (error) {
        console.error('[AutoRules] Unexpected error:', error);
        return NextResponse.json(
            { success: false, error: 'Erro interno' },
            { status: 500 }
        );
    }
}

// ============================================================================
// PATCH - Update rule
// ============================================================================
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'ID da regra obrigatório' },
                { status: 400 }
            );
        }

        // Check if it's a system rule
        if (isSystemRule(id)) {
            // System rules can only toggle enabled status
            const allowedUpdates = { enabled: updates.enabled };
            if (Object.keys(updates).some(k => k !== 'enabled')) {
                return NextResponse.json(
                    { success: false, error: 'Regras do sistema só podem ser ativadas/desativadas' },
                    { status: 403 }
                );
            }
        }

        // Build update object
        const updateData: any = {};
        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.description !== undefined) updateData.description = updates.description;
        if (updates.marketplaces !== undefined || updates.marketplace !== undefined) {
            updateData.marketplaces = normalizeMarketplaces(updates.marketplaces ?? updates.marketplace);
        }
        if (updates.conditions !== undefined) updateData.conditions = updates.conditions;
        if (updates.conditionLogic !== undefined) updateData.condition_logic = updates.conditionLogic;
        if (updates.actions !== undefined) updateData.actions = updates.actions;
        if (updates.priority !== undefined) updateData.priority = updates.priority;
        if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
        if (updates.stopOnMatch !== undefined) updateData.stop_on_match = updates.stopOnMatch;

        // Conflict check when enabling or changing conditions/actions/marketplace
        const shouldCheckConflict = updateData.enabled !== false && (
            updateData.marketplaces !== undefined ||
            updateData.conditions !== undefined ||
            updateData.condition_logic !== undefined ||
            updateData.actions !== undefined ||
            updateData.enabled === true
        );

        if (shouldCheckConflict) {
            const { data: currentRow, error: currentError } = await (supabaseAdmin as any)
                .from('auto_rules' as any)
                .select('*')
                .eq('id', id)
                .single();

            if (currentError || !currentRow) {
                console.error('[AutoRules] Error loading rule for conflict check:', currentError);
                return NextResponse.json(
                    { success: false, error: 'Erro ao validar conflito de regras' },
                    { status: 500 }
                );
            }

            const currentRule = dbRowToRule(currentRow);
            const candidateRule: AutoRule = {
                ...currentRule,
                name: updateData.name ?? currentRule.name,
                description: updateData.description ?? currentRule.description,
                marketplaces: normalizeMarketplaces(updateData.marketplaces ?? currentRule.marketplaces),
                conditions: updateData.conditions ?? currentRule.conditions,
                conditionLogic: updateData.condition_logic ?? currentRule.conditionLogic,
                actions: updateData.actions ?? currentRule.actions,
                priority: updateData.priority ?? currentRule.priority,
                enabled: updateData.enabled ?? currentRule.enabled,
                stopOnMatch: updateData.stop_on_match ?? currentRule.stopOnMatch,
            };

            if (candidateRule.enabled) {
                const { data: existingRows, error: existingError } = await (supabaseAdmin as any)
                    .from('auto_rules' as any)
                    .select('*')
                    .eq('enabled', true)
                    .neq('id', id);

                if (existingError) {
                    console.error('[AutoRules] Error checking conflicts:', existingError);
                    return NextResponse.json(
                        { success: false, error: 'Erro ao validar conflito de regras' },
                        { status: 500 }
                    );
                }

                const systemRules = getSystemRules().filter((r) => r.enabled);
                const existingRules = (existingRows || []).map(dbRowToRule);
                const allExisting = [...existingRules, ...systemRules];

                const candidateSignature = buildRuleSignature(candidateRule);
                const candidateActions = buildActionsSignature(candidateRule);
                const candidateMarketplaces = normalizeMarketplaces(candidateRule.marketplaces);

                const duplicate = allExisting.find((rule) => {
                    if (!rule.enabled) return false;
                    if (!marketplacesOverlap(rule.marketplaces, candidateMarketplaces)) return false;
                    const signature = buildRuleSignature(rule);
                    if (signature !== candidateSignature) return false;
                    return buildActionsSignature(rule) === candidateActions;
                });

                if (duplicate) {
                    return NextResponse.json(
                        {
                            success: false,
                            error: 'Já existe uma regra ativa com as mesmas condições.',
                            conflict: {
                                type: 'duplicate',
                                rule: duplicate,
                            },
                        },
                        { status: 409 }
                    );
                }

                const conflict = allExisting.find((rule) => {
                    if (!rule.enabled) return false;
                    if (!marketplacesOverlap(rule.marketplaces, candidateMarketplaces)) return false;
                    const signature = buildRuleSignature(rule);
                    if (signature !== candidateSignature) return false;
                    return buildActionsSignature(rule) !== candidateActions;
                });

                if (conflict) {
                    return NextResponse.json(
                        {
                            success: false,
                            error: 'Conflito: já existe uma regra ativa com as mesmas condições e ações diferentes.',
                            conflict: {
                                type: 'conflict',
                                rule: conflict,
                            },
                        },
                        { status: 409 }
                    );
                }
            }
        }

        const { data, error } = await (supabaseAdmin as any)
            .from('auto_rules' as any)
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[AutoRules] Error updating rule:', error);
            return NextResponse.json(
                { success: false, error: 'Erro ao atualizar regra' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            rule: dbRowToRule(data),
        });
    } catch (error) {
        console.error('[AutoRules] Unexpected error:', error);
        return NextResponse.json(
            { success: false, error: 'Erro interno' },
            { status: 500 }
        );
    }
}

// ============================================================================
// DELETE - Remove rule
// ============================================================================
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'ID da regra obrigatório' },
                { status: 400 }
            );
        }

        // Check if it's a system rule
        if (isSystemRule(id)) {
            return NextResponse.json(
                { success: false, error: 'Regras do sistema não podem ser deletadas' },
                { status: 403 }
            );
        }

        const { error } = await (supabaseAdmin as any)
            .from('auto_rules' as any)
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[AutoRules] Error deleting rule:', error);
            return NextResponse.json(
                { success: false, error: 'Erro ao deletar regra' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[AutoRules] Unexpected error:', error);
        return NextResponse.json(
            { success: false, error: 'Erro interno' },
            { status: 500 }
        );
    }
}
