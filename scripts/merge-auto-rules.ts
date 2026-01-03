import { supabaseAdmin } from '../lib/supabaseAdmin';
import { normalizeMarketplaces } from '../lib/rules/marketplaces';

type AutoRuleRow = {
    id: string;
    name: string;
    description: string | null;
    marketplaces: string[] | null;
    conditions: any[] | null;
    condition_logic: string | null;
    actions: any[] | null;
    priority: number | null;
    enabled: boolean | null;
    stop_on_match: boolean | null;
    is_system_rule?: boolean | null;
    created_at: string;
};

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
            field: condition.field,
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
            if (action.reviewNote) base.reviewNote = normalizeText(action.reviewNote);
            return base;
        })
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
};

const normalizeNonTagActions = (actions: any[]) => {
    return normalizeActions(actions).filter((action) => action.type !== 'add_tags');
};

const collectTags = (actions: any[]) => {
    const tags = new Set<string>();
    if (!Array.isArray(actions)) return tags;
    actions.forEach((action) => {
        if (action?.type !== 'add_tags') return;
        const list = Array.isArray(action.tags) ? action.tags : [];
        list.forEach((tag) => {
            if (!tag) return;
            tags.add(normalizeText(String(tag)));
        });
    });
    return tags;
};

const hasSingleCondition = (rule: AutoRuleRow) => {
    return Array.isArray(rule.conditions) && rule.conditions.length === 1;
};

const extractConditionTexts = (condition: any) => {
    const values: string[] = [];
    if (!condition) return values;
    if (typeof condition.value === 'string') values.push(condition.value);
    if (typeof condition.value2 === 'string') values.push(condition.value2);
    return values;
};

const conditionMatchesToken = (condition: any, token: string, normalizedToken: string) => {
    const values = extractConditionTexts(condition);
    for (const rawValue of values) {
        const normalizedValue = normalizeText(rawValue);
        if (normalizedValue.includes(normalizedToken)) return true;
        if (condition?.operator === 'regex') {
            try {
                const regex = new RegExp(rawValue, 'i');
                if (regex.test(token) || regex.test(normalizedToken)) return true;
            } catch {
                // Ignore invalid regex and fall back to substring match.
            }
        }
    }
    return false;
};

const ruleMatchesToken = (rule: AutoRuleRow, token: string) => {
    const normalizedToken = normalizeText(token);
    if (normalizeText(rule.name || '').includes(normalizedToken)) return true;
    if (rule.description && normalizeText(rule.description).includes(normalizedToken)) return true;

    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
    return conditions.some((condition) => conditionMatchesToken(condition, token, normalizedToken));
};

const isTokenMergeableRule = (rule: AutoRuleRow, token: string) => {
    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
    if (conditions.length === 0) return false;
    if (!ruleMatchesToken(rule, token)) return false;
    if (conditions.length > 1) {
        const logic = (rule.condition_logic || 'AND').toUpperCase();
        if (logic !== 'OR') return false;
    }
    return conditions.every((condition) => {
        if (!condition) return false;
        if (typeof condition.value !== 'string') return false;
        return condition.operator === 'contains' || condition.operator === 'regex';
    });
};

const buildSignature = (rule: AutoRuleRow) => {
    const conditionLogic = (rule.condition_logic || 'AND').toUpperCase();
    const stopOnMatch = rule.stop_on_match ? '1' : '0';
    return JSON.stringify({
        conditionLogic,
        stopOnMatch,
        conditions: normalizeConditions(rule.conditions || []),
    });
};

const mergeMarketplaces = (rows: AutoRuleRow[]) => {
    const all = rows.flatMap((row) => normalizeMarketplaces(row.marketplaces || undefined));
    return normalizeMarketplaces(all);
};

const sortKeepers = (a: AutoRuleRow, b: AutoRuleRow) => {
    const prioA = a.priority ?? 0;
    const prioB = b.priority ?? 0;
    if (prioA !== prioB) return prioB - prioA;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
};

const mergeActions = (rules: AutoRuleRow[]) => {
    const tags = new Set<string>();
    const actionValues = new Map<string, string | null>();
    const otherActions = new Map<string, any>();
    let hasExpense = false;
    let hasIncome = false;
    let hasSkip = false;
    let conflict: string | null = null;

    const recordValue = (type: string, value?: string | null) => {
        const normalizedValue = value ? normalizeText(value) : '';
        if (actionValues.has(type) && actionValues.get(type) !== normalizedValue) {
            conflict = `Conflito em ${type}`;
            return false;
        }
        actionValues.set(type, normalizedValue);
        return true;
    };

    const recordOther = (action: any) => {
        const normalized = normalizeActions([action])[0];
        const key = JSON.stringify(normalized);
        if (otherActions.size > 0 && !otherActions.has(key)) {
            conflict = `Conflito em ação ${action.type}`;
            return false;
        }
        otherActions.set(key, action);
        return true;
    };

    for (const rule of rules) {
        const actions = Array.isArray(rule.actions) ? rule.actions : [];
        for (const action of actions) {
            if (!action?.type) continue;
            if (action.type === 'add_tags') {
                collectTags([action]).forEach((tag) => tags.add(tag));
                continue;
            }
            if (action.type === 'mark_expense') {
                hasExpense = true;
                continue;
            }
            if (action.type === 'mark_income') {
                hasIncome = true;
                continue;
            }
            if (action.type === 'skip') {
                hasSkip = true;
                continue;
            }
            if (action.type === 'set_type') {
                if (!recordValue('set_type', action.transactionType)) break;
                continue;
            }
            if (action.type === 'set_description') {
                if (!recordValue('set_description', action.description)) break;
                continue;
            }
            if (action.type === 'set_category') {
                if (!recordValue('set_category', action.category)) break;
                continue;
            }
            if (action.type === 'flag_review') {
                if (!recordValue('flag_review', action.reviewNote)) break;
                continue;
            }
            if (!recordOther(action)) break;
        }
        if (conflict) break;
    }

    if (!conflict && hasExpense && hasIncome) {
        conflict = 'Conflito entre mark_expense e mark_income';
    }

    if (conflict) {
        return { conflict };
    }

    const mergedActions: any[] = [];
    const mergedTags = Array.from(tags).sort();
    if (mergedTags.length > 0) {
        mergedActions.push({ type: 'add_tags', tags: mergedTags });
    }
    if (hasExpense) mergedActions.push({ type: 'mark_expense' });
    if (hasIncome) mergedActions.push({ type: 'mark_income' });
    if (hasSkip) mergedActions.push({ type: 'skip' });

    if (actionValues.has('set_type')) {
        mergedActions.push({ type: 'set_type', transactionType: actionValues.get('set_type') || '' });
    }
    if (actionValues.has('set_description')) {
        mergedActions.push({ type: 'set_description', description: actionValues.get('set_description') || '' });
    }
    if (actionValues.has('set_category')) {
        mergedActions.push({ type: 'set_category', category: actionValues.get('set_category') || '' });
    }
    if (actionValues.has('flag_review')) {
        mergedActions.push({ type: 'flag_review', reviewNote: actionValues.get('flag_review') || '' });
    }

    if (otherActions.size > 0) {
        mergedActions.push(...Array.from(otherActions.values()));
    }

    return { actions: mergedActions };
};

const fetchRules = async () => {
    const { data, error } = await supabaseAdmin
        .from('auto_rules')
        .select('*');

    if (error) {
        console.error('[merge-auto-rules] Failed to load rules:', error);
        process.exit(1);
    }

    return (data || []).filter((row: AutoRuleRow) => !row.is_system_rule) as AutoRuleRow[];
};

const buildActionSignature = (rule: AutoRuleRow) => {
    return JSON.stringify(normalizeActions(rule.actions || []));
};

const mergeByExactMatch = async (rules: AutoRuleRow[]) => {
    const groups = new Map<string, AutoRuleRow[]>();
    rules.forEach((rule) => {
        const key = buildSignature(rule);
        const list = groups.get(key) || [];
        list.push(rule);
        groups.set(key, list);
    });

    let mergedGroups = 0;
    let disabledCount = 0;
    let updatedKeepers = 0;
    let conflictGroups = 0;

    for (const group of groups.values()) {
        if (group.length <= 1) continue;

        const sorted = [...group].sort(sortKeepers);
        const keeper = sorted[0];
        const duplicates = sorted.slice(1);

        const actionMerge = mergeActions(group);
        if (actionMerge.conflict) {
            conflictGroups += 1;
            console.log(
                `[merge-auto-rules] Conflito ao mesclar (${actionMerge.conflict}) -> ${group.map((r) => `${r.id}:${r.name}`).join(', ')}`
            );
            continue;
        }

        mergedGroups += 1;
        const mergedMarketplaces = mergeMarketplaces(group);
        const maxPriority = Math.max(...group.map((r) => r.priority ?? 0));
        const anyEnabled = group.some((r) => r.enabled);
        const mergedActions = actionMerge.actions || [];

        const { error: updateError } = await supabaseAdmin
            .from('auto_rules')
            .update({
                marketplaces: mergedMarketplaces,
                priority: maxPriority,
                enabled: anyEnabled,
                actions: mergedActions,
            })
            .eq('id', keeper.id);

        if (updateError) {
            console.error('[merge-auto-rules] Failed to update keeper:', keeper.id, updateError);
            continue;
        }
        updatedKeepers += 1;

        const duplicateIds = duplicates.map((r) => r.id);
        const { error: disableError } = await supabaseAdmin
            .from('auto_rules')
            .update({ enabled: false })
            .in('id', duplicateIds);

        if (disableError) {
            console.error('[merge-auto-rules] Failed to disable duplicates:', duplicateIds.join(', '), disableError);
            continue;
        }

        disabledCount += duplicateIds.length;
        console.log(
            `[merge-auto-rules] Merged ${group.length} rules -> kept ${keeper.id} (${keeper.name}), disabled ${duplicateIds.length}`
        );
    }

    return { mergedGroups, updatedKeepers, disabledCount, conflictGroups };
};

const mergeSingleConditionByActions = async (rules: AutoRuleRow[]) => {
    const groups = new Map<string, AutoRuleRow[]>();

    rules.forEach((rule) => {
        const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
        if (conditions.length !== 1) return;
        const key = JSON.stringify({
            stopOnMatch: rule.stop_on_match ? '1' : '0',
            actions: buildActionSignature(rule),
        });
        const list = groups.get(key) || [];
        list.push(rule);
        groups.set(key, list);
    });

    let mergedGroups = 0;
    let disabledCount = 0;
    let updatedKeepers = 0;

    for (const group of groups.values()) {
        if (group.length <= 1) continue;

        const sorted = [...group].sort(sortKeepers);
        const keeper = sorted[0];
        const duplicates = sorted.slice(1);

        const conditionMap = new Map<string, any>();
        group.forEach((rule) => {
            const condition = (rule.conditions || [])[0];
            if (!condition) return;
            const signature = JSON.stringify(normalizeConditions([condition]));
            if (!conditionMap.has(signature)) {
                conditionMap.set(signature, condition);
            }
        });

        if (conditionMap.size <= 1) continue;

        mergedGroups += 1;
        const mergedMarketplaces = mergeMarketplaces(group);
        const maxPriority = Math.max(...group.map((r) => r.priority ?? 0));
        const anyEnabled = group.some((r) => r.enabled);
        const mergedConditions = Array.from(conditionMap.values());

        const { error: updateError } = await supabaseAdmin
            .from('auto_rules')
            .update({
                marketplaces: mergedMarketplaces,
                priority: maxPriority,
                enabled: anyEnabled,
                conditions: mergedConditions,
                condition_logic: 'OR',
            })
            .eq('id', keeper.id);

        if (updateError) {
            console.error('[merge-auto-rules] Failed to update OR-merge keeper:', keeper.id, updateError);
            continue;
        }
        updatedKeepers += 1;

        const duplicateIds = duplicates.map((r) => r.id);
        const { error: disableError } = await supabaseAdmin
            .from('auto_rules')
            .update({ enabled: false })
            .in('id', duplicateIds);

        if (disableError) {
            console.error('[merge-auto-rules] Failed to disable OR-merge duplicates:', duplicateIds.join(', '), disableError);
            continue;
        }

        disabledCount += duplicateIds.length;
        console.log(
            `[merge-auto-rules] OR-merged ${group.length} rules -> kept ${keeper.id} (${keeper.name}), disabled ${duplicateIds.length}`
        );
    }

    return { mergedGroups, updatedKeepers, disabledCount };
};

const mergeByToken = async (rules: AutoRuleRow[], token: string) => {
    const groups = new Map<string, AutoRuleRow[]>();

    rules.forEach((rule) => {
        if (!isTokenMergeableRule(rule, token)) return;
        const stopKey = rule.stop_on_match ? '1' : '0';
        const list = groups.get(stopKey) || [];
        list.push(rule);
        groups.set(stopKey, list);
    });

    let mergedGroups = 0;
    let disabledCount = 0;
    let updatedKeepers = 0;
    let conflictGroups = 0;

    for (const group of groups.values()) {
        if (group.length <= 1) continue;

        const sorted = [...group].sort(sortKeepers);
        const keeper = sorted[0];
        const duplicates = sorted.slice(1);

        const actionMerge = mergeActions(group);
        if (actionMerge.conflict) {
            conflictGroups += 1;
            console.log(
                `[merge-auto-rules] Token "${token}" conflict (${actionMerge.conflict}) -> ${group.map((r) => `${r.id}:${r.name}`).join(', ')}`
            );
            continue;
        }

        const conditionMap = new Map<string, any>();
        group.forEach((rule) => {
            const condition = (rule.conditions || [])[0];
            if (!condition) return;
            const signature = JSON.stringify(normalizeConditions([condition]));
            if (!conditionMap.has(signature)) {
                conditionMap.set(signature, condition);
            }
        });

        const mergedConditions = Array.from(conditionMap.values());
        const mergedMarketplaces = mergeMarketplaces(group);
        const maxPriority = Math.max(...group.map((r) => r.priority ?? 0));
        const anyEnabled = group.some((r) => r.enabled);
        const mergedActions = actionMerge.actions || [];
        const mergedConditionLogic =
            mergedConditions.length > 1 ? 'OR' : keeper.condition_logic || null;

        const { error: updateError } = await supabaseAdmin
            .from('auto_rules')
            .update({
                marketplaces: mergedMarketplaces,
                priority: maxPriority,
                enabled: anyEnabled,
                actions: mergedActions,
                conditions: mergedConditions,
                condition_logic: mergedConditionLogic,
            })
            .eq('id', keeper.id);

        if (updateError) {
            console.error('[merge-auto-rules] Failed to update token keeper:', keeper.id, updateError);
            continue;
        }
        updatedKeepers += 1;
        mergedGroups += 1;

        const duplicateIds = duplicates.map((r) => r.id);
        const { error: disableError } = await supabaseAdmin
            .from('auto_rules')
            .update({ enabled: false })
            .in('id', duplicateIds);

        if (disableError) {
            console.error('[merge-auto-rules] Failed to disable token duplicates:', duplicateIds.join(', '), disableError);
            continue;
        }

        disabledCount += duplicateIds.length;
        console.log(
            `[merge-auto-rules] Token "${token}" merged ${group.length} rules -> kept ${keeper.id} (${keeper.name}), disabled ${duplicateIds.length}`
        );
    }

    return { mergedGroups, updatedKeepers, disabledCount, conflictGroups };
};

async function main() {
    const rules = await fetchRules();
    const exact = await mergeByExactMatch(rules);
    const refreshed = await fetchRules();
    const orMerge = await mergeSingleConditionByActions(refreshed);
    let afterOrMerge = await fetchRules();

    const tokenTargets = ['recarga por compra de ads', 'saque', 'anuncio'];
    const tokenResults = [];
    for (const token of tokenTargets) {
        const result = await mergeByToken(afterOrMerge, token);
        tokenResults.push({ token, ...result });
        afterOrMerge = await fetchRules();
    }

    const tokenSummary = tokenResults.reduce(
        (acc, result) => {
            acc.mergedGroups += result.mergedGroups;
            acc.updatedKeepers += result.updatedKeepers;
            acc.disabledCount += result.disabledCount;
            acc.conflictGroups += result.conflictGroups;
            return acc;
        },
        { mergedGroups: 0, updatedKeepers: 0, disabledCount: 0, conflictGroups: 0 }
    );

    console.log('==============================');
    console.log('[merge-auto-rules] Summary');
    console.log(`Total rules: ${afterOrMerge.length}`);
    console.log(`Exact merged groups: ${exact.mergedGroups}`);
    console.log(`Exact keepers updated: ${exact.updatedKeepers}`);
    console.log(`Exact duplicates disabled: ${exact.disabledCount}`);
    console.log(`Exact conflict groups (not merged): ${exact.conflictGroups}`);
    console.log(`OR merged groups: ${orMerge.mergedGroups}`);
    console.log(`OR keepers updated: ${orMerge.updatedKeepers}`);
    console.log(`OR duplicates disabled: ${orMerge.disabledCount}`);
    console.log(`Token merged groups: ${tokenSummary.mergedGroups}`);
    console.log(`Token keepers updated: ${tokenSummary.updatedKeepers}`);
    console.log(`Token duplicates disabled: ${tokenSummary.disabledCount}`);
    console.log(`Token conflict groups (not merged): ${tokenSummary.conflictGroups}`);
}

main().catch((error) => {
    console.error('[merge-auto-rules] Unexpected error:', error);
    process.exit(1);
});
