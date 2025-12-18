// API route to generate entries from recurring schedules
// Can be called by a cron job or manually triggered
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const db = supabaseAdmin as any;

// POST - Generate entries for all due recurring schedules
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { targetDate = new Date().toISOString().split('T')[0] } = body;

        // Find all active recurring entries that are due
        const { data: dueEntries, error: fetchError } = await db
            .from('recurring_entries')
            .select('*')
            .eq('is_active', true)
            .lte('next_due_date', targetDate);

        if (fetchError) {
            console.error('[generate] Fetch error:', fetchError);
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        const entries = dueEntries || [];
        const results = {
            processed: 0,
            generated: 0,
            skipped: 0,
            errors: [] as string[],
        };

        for (const recurring of entries) {
            results.processed++;

            try {
                // Check if past end date
                if (recurring.end_date && new Date(recurring.next_due_date) > new Date(recurring.end_date)) {
                    // Deactivate schedule
                    await db
                        .from('recurring_entries')
                        .update({ is_active: false, updated_at: new Date().toISOString() })
                        .eq('id', recurring.id);
                    results.skipped++;
                    continue;
                }

                // Check if entry already exists for this date
                const { data: existing } = await db
                    .from('cash_flow_entries')
                    .select('id')
                    .eq('parent_recurring_id', recurring.id)
                    .eq('due_date', recurring.next_due_date)
                    .maybeSingle();

                if (existing) {
                    results.skipped++;
                    continue;
                }

                // Create the cash flow entry
                const { error: insertError } = await db
                    .from('cash_flow_entries')
                    .insert({
                        source: 'recurring',
                        source_id: `recurring-${recurring.id}-${recurring.next_due_date}`,
                        type: recurring.type,
                        amount: recurring.amount,
                        description: recurring.description,
                        category: recurring.category,
                        category_id: recurring.category_id,
                        subcategory: recurring.subcategory,
                        entity_name: recurring.entity_name,
                        entity_type: recurring.entity_type,
                        cost_center: recurring.cost_center,
                        tags: recurring.tags,
                        due_date: recurring.next_due_date,
                        competence_date: recurring.next_due_date,
                        status: 'pending',
                        parent_recurring_id: recurring.id,
                        is_generated: true,
                    });

                if (insertError) {
                    results.errors.push(`Entry ${recurring.id}: ${insertError.message}`);
                    continue;
                }

                results.generated++;

                // Calculate next due date
                const nextDate = calculateNextDueDate(
                    new Date(recurring.next_due_date),
                    recurring.frequency,
                    recurring.day_of_month,
                    recurring.day_of_week
                );

                // Update recurring entry
                await db
                    .from('recurring_entries')
                    .update({
                        last_generated_date: recurring.next_due_date,
                        next_due_date: nextDate.toISOString().split('T')[0],
                        total_generated: (recurring.total_generated || 0) + 1,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', recurring.id);

            } catch (err) {
                results.errors.push(`Entry ${recurring.id}: ${err}`);
            }
        }

        return NextResponse.json({
            success: true,
            targetDate,
            results,
        });
    } catch (error) {
        console.error('[generate] Error:', error);
        return NextResponse.json({ error: 'Erro ao gerar entradas' }, { status: 500 });
    }
}

// GET - Preview entries that would be generated
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const targetDate = searchParams.get('date') || new Date().toISOString().split('T')[0];

        const { data, error } = await db
            .from('recurring_entries')
            .select('id, description, amount, type, next_due_date, frequency')
            .eq('is_active', true)
            .lte('next_due_date', targetDate);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            targetDate,
            pendingCount: data?.length || 0,
            entries: data || [],
        });
    } catch (error) {
        console.error('[generate] Error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

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
