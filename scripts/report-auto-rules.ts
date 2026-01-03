import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getSystemRules } from '../lib/rules/system-rules';

type AutoRuleRow = {
    id: string;
    name: string;
    marketplaces: string[] | null;
    conditions: any[] | null;
    condition_logic: string | null;
    actions: any[] | null;
    enabled: boolean | null;
    stop_on_match: boolean | null;
    is_system_rule?: boolean | null;
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

const conditionSignature = (conditions: any[], logic: string | null) => {
    const normalized = (conditions || []).map((condition) => ({
        field: condition.field,
        operator: condition.operator,
        value: normalizeConditionValue(condition.value, condition.operator),
        value2: normalizeConditionValue(condition.value2, condition.operator),
    }));
    const ordered = normalized.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return JSON.stringify({
        logic: (logic || 'AND').toUpperCase(),
        conditions: ordered,
    });
};

const actionSummary = (actions: any[]) => {
    if (!Array.isArray(actions)) return '';
    return actions.map((action) => {
        if (action.type === 'add_tags') return `tags(${(action.tags || []).join(',')})`;
        if (action.type === 'set_type') return `set_type(${action.transactionType || ''})`;
        if (action.type === 'set_category') return `set_category(${action.category || ''})`;
        if (action.type === 'set_description') return `set_description(${action.description || ''})`;
        if (action.type === 'flag_review') return `flag_review(${action.reviewNote || ''})`;
        return action.type;
    }).join('; ');
};

async function main() {
    const { data, error } = await supabaseAdmin.from('auto_rules').select('*');
    if (error) {
        console.error('[report-auto-rules] Error loading rules:', error);
        process.exit(1);
    }

    const dbRules = (data || []).filter((row: AutoRuleRow) => !row.is_system_rule) as AutoRuleRow[];
    const systemRules = getSystemRules().map((rule) => ({
        id: rule.id,
        name: rule.name,
        marketplaces: rule.marketplaces,
        conditions: rule.conditions,
        condition_logic: rule.conditionLogic,
        actions: rule.actions,
        enabled: rule.enabled,
        stop_on_match: rule.stopOnMatch,
        is_system_rule: true,
    }));

    const allRules = [...dbRules, ...systemRules];
    const nameGroups = new Map<string, AutoRuleRow[]>();
    const conditionGroups = new Map<string, AutoRuleRow[]>();

    allRules.forEach((rule) => {
        const nameKey = normalizeText(rule.name || '');
        const nameList = nameGroups.get(nameKey) || [];
        nameList.push(rule);
        nameGroups.set(nameKey, nameList);

        const condKey = conditionSignature(rule.conditions || [], rule.condition_logic || null);
        const condList = conditionGroups.get(condKey) || [];
        condList.push(rule);
        conditionGroups.set(condKey, condList);
    });

    console.log('==============================');
    console.log('[report-auto-rules] Duplicadas por nome');
    nameGroups.forEach((group, key) => {
        if (group.length <= 1) return;
        console.log(`- ${key} (${group.length})`);
        group.forEach((rule) => {
            const origin = rule.is_system_rule ? 'system' : 'user';
            console.log(`  • ${origin} ${rule.id} enabled=${rule.enabled ? 'true' : 'false'} actions=${actionSummary(rule.actions || [])}`);
        });
    });

    console.log('==============================');
    console.log('[report-auto-rules] Duplicadas por condições');
    conditionGroups.forEach((group) => {
        if (group.length <= 1) return;
        console.log(`- ${group.length} regras`);
        group.forEach((rule) => {
            const origin = rule.is_system_rule ? 'system' : 'user';
            console.log(`  • ${origin} ${rule.id} ${rule.name} actions=${actionSummary(rule.actions || [])}`);
        });
    });
}

main().catch((err) => {
    console.error('[report-auto-rules] Unexpected error:', err);
    process.exit(1);
});
