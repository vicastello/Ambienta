// API route for individual cash flow entry operations (update, delete)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Cast to any for new columns until types are synced
const db = supabaseAdmin as any;

// GET - Fetch single entry
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const { data, error } = await db
            .from('cash_flow_entries')
            .select('*, financial_categories(*)')
            .eq('id', id)
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data) {
            return NextResponse.json({ error: 'Lançamento não encontrado' }, { status: 404 });
        }

        return NextResponse.json({ entry: data });
    } catch (error) {
        console.error('[entry] Error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// PUT - Update entry
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const {
            description,
            amount,
            category,
            category_id,
            subcategory,
            due_date,
            paid_date,
            competence_date,
            status,
            entity_name,
            entity_type,
            cost_center,
            tags,
            notes,
        } = body;

        // Build update object
        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

        if (description !== undefined) updateData.description = description;
        if (amount !== undefined) updateData.amount = amount;
        if (category !== undefined) updateData.category = category;
        if (category_id !== undefined) updateData.category_id = category_id;
        if (subcategory !== undefined) updateData.subcategory = subcategory;
        if (due_date !== undefined) updateData.due_date = due_date;
        if (paid_date !== undefined) updateData.paid_date = paid_date;
        if (competence_date !== undefined) updateData.competence_date = competence_date;
        if (status !== undefined) updateData.status = status;
        if (entity_name !== undefined) updateData.entity_name = entity_name;
        if (entity_type !== undefined) updateData.entity_type = entity_type;
        if (cost_center !== undefined) updateData.cost_center = cost_center;
        if (tags !== undefined) updateData.tags = tags;
        if (notes !== undefined) updateData.notes = notes;

        const { data, error } = await db
            .from('cash_flow_entries')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[entry] Update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ entry: data });
    } catch (error) {
        console.error('[entry] Error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// DELETE - Cancel/Delete entry
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'cancel'; // 'cancel' or 'delete'

    try {
        if (mode === 'cancel') {
            // Soft delete - mark as cancelled
            const { data, error } = await db
                .from('cash_flow_entries')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ entry: data, message: 'Lançamento cancelado' });
        } else {
            // Hard delete
            const { error } = await db
                .from('cash_flow_entries')
                .delete()
                .eq('id', id);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, message: 'Lançamento excluído' });
        }
    } catch (error) {
        console.error('[entry] Delete error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// POST - Duplicate entry
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        // Fetch original entry
        const { data: original, error: fetchError } = await db
            .from('cash_flow_entries')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !original) {
            return NextResponse.json({ error: 'Lançamento original não encontrado' }, { status: 404 });
        }

        // Create duplicate with new ID and reset dates
        const duplicate = {
            ...original,
            id: undefined,
            source_id: crypto.randomUUID(),
            status: 'pending',
            paid_date: null,
            due_date: new Date().toISOString().split('T')[0],
            created_at: undefined,
            updated_at: undefined,
        };

        const { data, error } = await db
            .from('cash_flow_entries')
            .insert(duplicate)
            .select()
            .single();

        if (error) {
            console.error('[entry] Duplicate error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ entry: data, message: 'Lançamento duplicado' }, { status: 201 });
    } catch (error) {
        console.error('[entry] Error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
