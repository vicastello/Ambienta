// API route for recurring entries CRUD and generation
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const db = supabaseAdmin as any;

// GET - List all recurring entries
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const activeOnly = searchParams.get('active') !== 'false';
        const type = searchParams.get('type'); // income | expense

        let query = db
            .from('recurring_entries')
            .select('*, financial_categories(id, name, color)')
            .order('next_due_date', { ascending: true });

        if (activeOnly) {
            query = query.eq('is_active', true);
        }

        if (type) {
            query = query.eq('type', type);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[recurring] Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ entries: data || [] });
    } catch (error) {
        console.error('[recurring] Error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// POST - Create new recurring entry
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            type,
            amount,
            description,
            category,
            category_id,
            subcategory,
            entity_name,
            entity_type,
            cost_center,
            tags = [],
            notes,
            frequency,
            day_of_month,
            day_of_week,
            start_date,
            end_date,
        } = body;

        // Validate required fields
        if (!type || !amount || !description || !frequency || !start_date) {
            return NextResponse.json(
                { error: 'Campos obrigatórios: type, amount, description, frequency, start_date' },
                { status: 400 }
            );
        }

        // Calculate next due date
        const nextDueDate = calculateNextDueDate(new Date(start_date), frequency, day_of_month, day_of_week);

        const { data, error } = await db
            .from('recurring_entries')
            .insert({
                type,
                amount,
                description,
                category,
                category_id,
                subcategory,
                entity_name,
                entity_type,
                cost_center,
                tags,
                notes,
                frequency,
                day_of_month,
                day_of_week,
                start_date,
                end_date,
                next_due_date: nextDueDate.toISOString().split('T')[0],
            })
            .select()
            .single();

        if (error) {
            console.error('[recurring] Create error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ entry: data }, { status: 201 });
    } catch (error) {
        console.error('[recurring] Error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// PUT - Update recurring entry
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updateData } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
        }

        // Recalculate next due date if schedule changed
        if (updateData.frequency || updateData.day_of_month !== undefined || updateData.day_of_week !== undefined) {
            const { data: existing } = await db
                .from('recurring_entries')
                .select('start_date, last_generated_date')
                .eq('id', id)
                .single();

            if (existing) {
                const baseDate = existing.last_generated_date
                    ? new Date(existing.last_generated_date)
                    : new Date(existing.start_date);
                updateData.next_due_date = calculateNextDueDate(
                    baseDate,
                    updateData.frequency,
                    updateData.day_of_month,
                    updateData.day_of_week
                ).toISOString().split('T')[0];
            }
        }

        updateData.updated_at = new Date().toISOString();

        const { data, error } = await db
            .from('recurring_entries')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[recurring] Update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ entry: data });
    } catch (error) {
        console.error('[recurring] Error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// DELETE - Deactivate recurring entry
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const hard = searchParams.get('hard') === 'true';

        if (!id) {
            return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
        }

        if (hard) {
            // Hard delete - also delete generated entries
            await db
                .from('cash_flow_entries')
                .delete()
                .eq('parent_recurring_id', id);

            const { error } = await db
                .from('recurring_entries')
                .delete()
                .eq('id', id);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        } else {
            // Soft delete - just deactivate
            const { error } = await db
                .from('recurring_entries')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', id);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[recurring] Delete error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// Helper function to calculate next due date
function calculateNextDueDate(
    fromDate: Date,
    frequency: string,
    dayOfMonth?: number,
    dayOfWeek?: number
): Date {
    const next = new Date(fromDate);

    switch (frequency) {
        case 'daily':
            next.setDate(next.getDate() + 1);
            break;
        case 'weekly':
            next.setDate(next.getDate() + 7);
            if (dayOfWeek !== undefined) {
                const currentDay = next.getDay();
                const daysUntil = (dayOfWeek - currentDay + 7) % 7;
                next.setDate(next.getDate() + daysUntil);
            }
            break;
        case 'biweekly':
            next.setDate(next.getDate() + 14);
            break;
        case 'monthly':
            next.setMonth(next.getMonth() + 1);
            if (dayOfMonth) {
                const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                next.setDate(Math.min(dayOfMonth, lastDay));
            }
            break;
        case 'quarterly':
            next.setMonth(next.getMonth() + 3);
            if (dayOfMonth) {
                const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                next.setDate(Math.min(dayOfMonth, lastDay));
            }
            break;
        case 'yearly':
            next.setFullYear(next.getFullYear() + 1);
            break;
        default:
            next.setMonth(next.getMonth() + 1);
    }

    return next;
}
