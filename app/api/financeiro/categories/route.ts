// API route for financial categories CRUD
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Cast to any for new tables until types are synced
const db = supabaseAdmin as any;

export type FinancialCategory = {
    id: string;
    name: string;
    type: 'income' | 'expense' | 'both';
    color: string;
    icon: string;
    parent_id: string | null;
    is_system: boolean;
    is_active: boolean;
    sort_order: number;
    created_at: string;
    updated_at: string;
};

// GET - List all categories
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type'); // income, expense, or both
        const activeOnly = searchParams.get('activeOnly') !== 'false';

        let query = db
            .from('financial_categories')
            .select('*')
            .order('sort_order', { ascending: true });

        if (type && type !== 'all') {
            query = query.or(`type.eq.${type},type.eq.both`);
        }

        if (activeOnly) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[categories] Error fetching:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            categories: data || [],
            count: data?.length || 0,
        });
    } catch (error) {
        console.error('[categories] Error:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}

// POST - Create new category
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, type, color, icon, parent_id, sort_order } = body;

        if (!name || !type) {
            return NextResponse.json(
                { error: 'Nome e tipo são obrigatórios' },
                { status: 400 }
            );
        }

        if (!['income', 'expense', 'both'].includes(type)) {
            return NextResponse.json(
                { error: 'Tipo inválido. Use: income, expense, ou both' },
                { status: 400 }
            );
        }

        const { data, error } = await db
            .from('financial_categories')
            .insert({
                name,
                type,
                color: color || '#6366f1',
                icon: icon || 'tag',
                parent_id: parent_id || null,
                sort_order: sort_order || 0,
                is_system: false,
                is_active: true,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // Unique constraint violation
                return NextResponse.json(
                    { error: 'Já existe uma categoria com este nome' },
                    { status: 409 }
                );
            }
            console.error('[categories] Error creating:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ category: data }, { status: 201 });
    } catch (error) {
        console.error('[categories] Error:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}

// PUT - Update category
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, name, type, color, icon, parent_id, sort_order, is_active } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'ID é obrigatório' },
                { status: 400 }
            );
        }

        // Check if it's a system category (limited updates)
        const { data: existing } = await db
            .from('financial_categories')
            .select('is_system')
            .eq('id', id)
            .single();

        if (existing?.is_system) {
            // System categories can only update color, icon, and is_active
            const { data, error } = await db
                .from('financial_categories')
                .update({
                    color: color,
                    icon: icon,
                    is_active: is_active,
                })
                .eq('id', id)
                .select()
                .single();

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            return NextResponse.json({ category: data });
        }

        // Non-system categories can update everything
        const updateData: Record<string, any> = {};
        if (name !== undefined) updateData.name = name;
        if (type !== undefined) updateData.type = type;
        if (color !== undefined) updateData.color = color;
        if (icon !== undefined) updateData.icon = icon;
        if (parent_id !== undefined) updateData.parent_id = parent_id;
        if (sort_order !== undefined) updateData.sort_order = sort_order;
        if (is_active !== undefined) updateData.is_active = is_active;

        const { data, error } = await db
            .from('financial_categories')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json(
                    { error: 'Já existe uma categoria com este nome' },
                    { status: 409 }
                );
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ category: data });
    } catch (error) {
        console.error('[categories] Error:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}

// DELETE - Remove category (only non-system)
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'ID é obrigatório' },
                { status: 400 }
            );
        }

        // Check if it's a system category
        const { data: existing } = await db
            .from('financial_categories')
            .select('is_system, name')
            .eq('id', id)
            .single();

        if (!existing) {
            return NextResponse.json(
                { error: 'Categoria não encontrada' },
                { status: 404 }
            );
        }

        if (existing.is_system) {
            return NextResponse.json(
                { error: `"${existing.name}" é uma categoria do sistema e não pode ser excluída` },
                { status: 403 }
            );
        }

        // Check if category is in use
        const { count } = await db
            .from('cash_flow_entries')
            .select('id', { count: 'exact', head: true })
            .eq('category_id', id);

        if (count && count > 0) {
            return NextResponse.json(
                { error: `Esta categoria está em uso em ${count} lançamento(s). Desative-a ao invés de excluir.` },
                { status: 409 }
            );
        }

        const { error } = await db
            .from('financial_categories')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[categories] Error:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}
