// API route for installment plans (parcelamentos)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const db = supabaseAdmin as any;

// GET - List installment plans
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status'); // active, completed, cancelled

        let query = db
            .from('installment_plans')
            .select('*')
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[installments] Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ plans: data || [] });
    } catch (error) {
        console.error('[installments] Error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// POST - Create installment plan and generate entries
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            type,
            total_amount,
            description,
            category,
            category_id,
            entity_name,
            entity_type,
            total_installments,
            first_due_date,
            frequency = 'monthly',
        } = body;

        // Validate required fields
        if (!type || !total_amount || !description || !total_installments || !first_due_date) {
            return NextResponse.json(
                { error: 'Campos obrigatórios: type, total_amount, description, total_installments, first_due_date' },
                { status: 400 }
            );
        }

        if (total_installments < 2) {
            return NextResponse.json({ error: 'Mínimo de 2 parcelas' }, { status: 400 });
        }

        const installment_amount = Math.round((total_amount / total_installments) * 100) / 100;

        // Create the plan
        const { data: plan, error: planError } = await db
            .from('installment_plans')
            .insert({
                type,
                total_amount,
                description,
                category,
                category_id,
                entity_name,
                entity_type,
                total_installments,
                installment_amount,
                first_due_date,
                frequency,
            })
            .select()
            .single();

        if (planError) {
            console.error('[installments] Create plan error:', planError);
            return NextResponse.json({ error: planError.message }, { status: 500 });
        }

        // Generate all installment entries
        const entries = [];
        let dueDate = new Date(first_due_date);

        for (let i = 1; i <= total_installments; i++) {
            // Last installment gets remaining amount (avoids rounding issues)
            const amount = i === total_installments
                ? total_amount - (installment_amount * (total_installments - 1))
                : installment_amount;

            entries.push({
                source: 'installment',
                source_id: `installment-${plan.id}-${i}`,
                type,
                amount,
                description: `${description} (${i}/${total_installments})`,
                category,
                category_id,
                entity_name,
                entity_type,
                due_date: dueDate.toISOString().split('T')[0],
                competence_date: dueDate.toISOString().split('T')[0],
                status: 'pending',
                installment_plan_id: plan.id,
                installment_number: i,
                is_generated: true,
            });

            // Calculate next due date
            if (frequency === 'weekly') {
                dueDate.setDate(dueDate.getDate() + 7);
            } else if (frequency === 'biweekly') {
                dueDate.setDate(dueDate.getDate() + 14);
            } else {
                // Monthly
                dueDate.setMonth(dueDate.getMonth() + 1);
            }
        }

        // Insert all entries
        const { error: entriesError } = await db
            .from('cash_flow_entries')
            .insert(entries);

        if (entriesError) {
            console.error('[installments] Create entries error:', entriesError);
            // Rollback plan
            await db.from('installment_plans').delete().eq('id', plan.id);
            return NextResponse.json({ error: entriesError.message }, { status: 500 });
        }

        return NextResponse.json({
            plan,
            entriesCreated: entries.length,
        }, { status: 201 });
    } catch (error) {
        console.error('[installments] Error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// DELETE - Cancel installment plan
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const mode = searchParams.get('mode') || 'cancel'; // cancel or delete

        if (!id) {
            return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
        }

        if (mode === 'delete') {
            // Hard delete - remove plan and all pending entries
            await db
                .from('cash_flow_entries')
                .delete()
                .eq('installment_plan_id', id)
                .eq('status', 'pending');

            await db
                .from('installment_plans')
                .delete()
                .eq('id', id);
        } else {
            // Cancel - mark plan as cancelled and cancel pending entries
            await db
                .from('installment_plans')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', id);

            await db
                .from('cash_flow_entries')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('installment_plan_id', id)
                .eq('status', 'pending');
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[installments] Delete error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
