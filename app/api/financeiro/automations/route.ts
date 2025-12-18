// API route for automation rules CRUD and execution
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const db = supabaseAdmin as any;

// GET - List all automation rules
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const enabledOnly = searchParams.get('enabled') !== 'false';

        let query = db
            .from('automation_rules')
            .select('*')
            .order('priority', { ascending: false });

        if (enabledOnly) {
            query = query.eq('is_enabled', true);
        }

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ rules: data || [] });
    } catch (error) {
        console.error('[automations] Error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// POST - Create new rule or execute rules
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Execute rules on an entry
        if (body.action === 'execute') {
            const { entryId, event = 'entry_created' } = body;
            const result = await executeRulesOnEntry(entryId, event);
            return NextResponse.json(result);
        }

        // Create new rule
        const {
            name,
            description,
            trigger_event,
            conditions,
            actions,
            match_type = 'all',
            priority = 0,
        } = body;

        if (!name || !trigger_event || !conditions || !actions) {
            return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
        }

        const { data, error } = await db
            .from('automation_rules')
            .insert({
                name,
                description,
                trigger_event,
                conditions,
                actions,
                match_type,
                priority,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ rule: data }, { status: 201 });
    } catch (error) {
        console.error('[automations] Create error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// PUT - Update rule
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updateData } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
        }

        updateData.updated_at = new Date().toISOString();

        const { data, error } = await db
            .from('automation_rules')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ rule: data });
    } catch (error) {
        console.error('[automations] Update error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// DELETE - Remove rule
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
        }

        const { error } = await db
            .from('automation_rules')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[automations] Delete error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// Execute automation rules on an entry
async function executeRulesOnEntry(entryId: string, event: string) {
    // Get the entry
    const { data: entry, error: entryError } = await db
        .from('cash_flow_entries')
        .select('*')
        .eq('id', entryId)
        .single();

    if (entryError || !entry) {
        return { success: false, error: 'Entry not found' };
    }

    // Get matching rules for this event
    const { data: rules } = await db
        .from('automation_rules')
        .select('*')
        .eq('is_enabled', true)
        .eq('trigger_event', event)
        .order('priority', { ascending: false });

    if (!rules || rules.length === 0) {
        return { success: true, matched: 0, actions: [] };
    }

    const executedActions: string[] = [];
    const updates: Record<string, any> = {};

    for (const rule of rules) {
        if (evaluateConditions(entry, rule.conditions, rule.match_type)) {
            // Execute actions
            for (const action of rule.actions) {
                const result = executeAction(entry, updates, action);
                if (result) {
                    executedActions.push(`${rule.name}: ${result}`);
                }
            }

            // Update rule stats
            await db
                .from('automation_rules')
                .update({
                    times_triggered: (rule.times_triggered || 0) + 1,
                    last_triggered_at: new Date().toISOString(),
                })
                .eq('id', rule.id);
        }
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        await db
            .from('cash_flow_entries')
            .update(updates)
            .eq('id', entryId);
    }

    return {
        success: true,
        matched: executedActions.length,
        actions: executedActions,
    };
}

// Evaluate conditions against entry
function evaluateConditions(entry: any, conditions: any[], matchType: string): boolean {
    if (!conditions || conditions.length === 0) return true;

    const results = conditions.map(cond => {
        const fieldValue = String(entry[cond.field] || '');
        const condValue = String(cond.value || '');

        switch (cond.operator) {
            case 'equals':
                return fieldValue === condValue;
            case 'not_equals':
                return fieldValue !== condValue;
            case 'contains':
                return fieldValue.includes(condValue);
            case 'icontains':
                return fieldValue.toLowerCase().includes(condValue.toLowerCase());
            case 'starts_with':
                return fieldValue.startsWith(condValue);
            case 'ends_with':
                return fieldValue.endsWith(condValue);
            case 'greater_than':
                return parseFloat(fieldValue) > parseFloat(condValue);
            case 'less_than':
                return parseFloat(fieldValue) < parseFloat(condValue);
            case 'is_empty':
                return !fieldValue || fieldValue.trim() === '';
            case 'is_not_empty':
                return fieldValue && fieldValue.trim() !== '';
            default:
                return false;
        }
    });

    return matchType === 'all'
        ? results.every(r => r)
        : results.some(r => r);
}

// Execute a single action
function executeAction(entry: any, updates: Record<string, any>, action: any): string | null {
    switch (action.action) {
        case 'set_category':
            updates.category = action.value;
            return `Categoria → ${action.value}`;
        case 'set_type':
            updates.type = action.value;
            return `Tipo → ${action.value}`;
        case 'set_status':
            updates.status = action.value;
            return `Status → ${action.value}`;
        case 'set_entity':
            updates.entity_name = action.value;
            return `Entidade → ${action.value}`;
        case 'set_cost_center':
            updates.cost_center = action.value;
            return `Centro custo → ${action.value}`;
        case 'add_tag':
            const currentTags = entry.tags || [];
            if (!currentTags.includes(action.value)) {
                updates.tags = [...currentTags, action.value];
                return `Tag + ${action.value}`;
            }
            return null;
        case 'remove_tag':
            const tags = entry.tags || [];
            updates.tags = tags.filter((t: string) => t !== action.value);
            return `Tag - ${action.value}`;
        default:
            return null;
    }
}
