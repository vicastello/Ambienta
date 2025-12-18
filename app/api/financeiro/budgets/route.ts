// API route for budget management and tracking
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const db = supabaseAdmin as any;

// GET - List budgets with optional tracking data
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const withTracking = searchParams.get('tracking') === 'true';
        const activeOnly = searchParams.get('active') !== 'false';

        let query = db
            .from('financial_budgets')
            .select('*')
            .order('start_date', { ascending: false });

        if (activeOnly) {
            query = query.eq('is_active', true);
        }

        const { data: budgets, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Calculate actual spending for each budget
        if (withTracking && budgets) {
            for (const budget of budgets) {
                const actual = await calculateActualSpending(budget);
                budget.actual_amount = actual;
                budget.variance = budget.planned_amount - actual;
                budget.variance_percent = budget.planned_amount > 0
                    ? ((budget.variance / budget.planned_amount) * 100).toFixed(1)
                    : 0;
                budget.status = getBudgetStatus(budget.planned_amount, actual, budget.alert_threshold);
            }
        }

        return NextResponse.json({ budgets: budgets || [] });
    } catch (error) {
        console.error('[budgets] Error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// POST - Create new budget
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            name,
            description,
            period_type,
            start_date,
            end_date,
            budget_type,
            target_value,
            planned_amount,
            alert_threshold = 80,
        } = body;

        if (!name || !period_type || !start_date || !end_date || !budget_type || !planned_amount) {
            return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
        }

        const { data, error } = await db
            .from('financial_budgets')
            .insert({
                name,
                description,
                period_type,
                start_date,
                end_date,
                budget_type,
                target_value,
                planned_amount,
                alert_threshold,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ budget: data }, { status: 201 });
    } catch (error) {
        console.error('[budgets] Create error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// PUT - Update budget
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updateData } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
        }

        updateData.updated_at = new Date().toISOString();

        const { data, error } = await db
            .from('financial_budgets')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ budget: data });
    } catch (error) {
        console.error('[budgets] Update error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// DELETE - Remove budget
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
        }

        const { error } = await db
            .from('financial_budgets')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[budgets] Delete error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// Calculate actual spending for a budget
async function calculateActualSpending(budget: any): Promise<number> {
    let query = db
        .from('cash_flow_entries')
        .select('amount')
        .eq('type', 'expense')
        .eq('status', 'confirmed')
        .gte('due_date', budget.start_date)
        .lte('due_date', budget.end_date);

    // Filter by budget type
    switch (budget.budget_type) {
        case 'category':
            if (budget.target_value) {
                query = query.eq('category', budget.target_value);
            }
            break;
        case 'cost_center':
            if (budget.target_value) {
                query = query.eq('cost_center', budget.target_value);
            }
            break;
        case 'entity':
            if (budget.target_value) {
                query = query.eq('entity_name', budget.target_value);
            }
            break;
        // 'total' - no additional filter
    }

    const { data } = await query;

    if (!data) return 0;

    return data.reduce((sum: number, entry: any) => sum + (entry.amount || 0), 0);
}

// Get budget status based on spending
function getBudgetStatus(planned: number, actual: number, threshold: number): string {
    if (planned <= 0) return 'on_track';

    const percentUsed = (actual / planned) * 100;

    if (percentUsed >= 100) return 'over_budget';
    if (percentUsed >= threshold) return 'warning';
    if (percentUsed < 50) return 'under_budget';
    return 'on_track';
}
