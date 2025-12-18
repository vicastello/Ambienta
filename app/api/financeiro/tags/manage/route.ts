// API route for managing available tags (CRUD)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Cast to any for new tables until types are regenerated
const db = supabaseAdmin as any;

// POST: Create new available tag
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, color } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
        }

        const { data, error } = await db
            .from('available_tags')
            .insert({
                name: name.trim(),
                color: color || '#6366f1',
                usage_count: 0
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // Unique violation
                return NextResponse.json({ error: 'Tag já existe' }, { status: 409 });
            }
            throw error;
        }

        return NextResponse.json({ tag: data });
    } catch (error: any) {
        console.error('[tags/manage] Error creating tag:', error);
        return NextResponse.json({ error: 'Erro ao criar tag' }, { status: 500 });
    }
}

// PUT: Update existing tag
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, name, color } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
        }

        const updateData: any = {};
        if (name?.trim()) updateData.name = name.trim();
        if (color) updateData.color = color;

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
        }

        // Get old name to update order_tags
        const { data: oldTag } = await db
            .from('available_tags')
            .select('name')
            .eq('id', id)
            .single();

        const { data, error } = await db
            .from('available_tags')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // If name changed, update all order_tags with old name
        if (name && oldTag && oldTag.name !== name.trim()) {
            await db
                .from('order_tags')
                .update({ tag_name: name.trim() })
                .eq('tag_name', oldTag.name);
        }

        return NextResponse.json({ tag: data });
    } catch (error: any) {
        console.error('[tags/manage] Error updating tag:', error);
        return NextResponse.json({ error: 'Erro ao atualizar tag' }, { status: 500 });
    }
}

// DELETE: Delete tag
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
        }

        // Get tag name first
        const { data: tag } = await db
            .from('available_tags')
            .select('name')
            .eq('id', id)
            .single();

        if (tag) {
            // Delete from order_tags first (cascading would do this, but be explicit)
            await db
                .from('order_tags')
                .delete()
                .eq('tag_name', tag.name);
        }

        // Delete the available tag
        const { error } = await db
            .from('available_tags')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[tags/manage] Error deleting tag:', error);
        return NextResponse.json({ error: 'Erro ao excluir tag' }, { status: 500 });
    }
}
