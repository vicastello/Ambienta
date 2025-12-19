import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Auto-Link Rules CRUD Endpoints
 */

// GET - List all rules
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const marketplace = searchParams.get('marketplace');

        let query = supabaseAdmin
            .from('payment_auto_link_rules')
            .select('*')
            .order('priority', { ascending: false });

        if (marketplace) {
            query = query.eq('marketplace', marketplace);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[AutoLinkRules] Error fetching rules:', error);
            return NextResponse.json({ error: 'Erro ao buscar regras' }, { status: 500 });
        }

        return NextResponse.json({ success: true, rules: data || [] });
    } catch (error) {
        console.error('[AutoLinkRules] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// POST - Create new rule
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { marketplace, transaction_type_pattern, action, tags, priority } = body;

        if (!marketplace || !transaction_type_pattern || !action) {
            return NextResponse.json(
                { error: 'Campos obrigatórios: marketplace, transaction_type_pattern, action' },
                { status: 400 }
            );
        }

        const { data, error } = await supabaseAdmin
            .from('payment_auto_link_rules')
            .insert({
                marketplace,
                transaction_type_pattern,
                action,
                tags: tags || [],
                priority: priority || 0,
            })
            .select()
            .single();

        if (error) {
            console.error('[AutoLinkRules] Error creating rule:', error);
            return NextResponse.json({ error: 'Erro ao criar regra' }, { status: 500 });
        }

        return NextResponse.json({ success: true, rule: data });
    } catch (error) {
        console.error('[AutoLinkRules] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// PATCH - Update rule
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID da regra obrigatório' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('payment_auto_link_rules')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[AutoLinkRules] Error updating rule:', error);
            return NextResponse.json({ error: 'Erro ao atualizar regra' }, { status: 500 });
        }

        return NextResponse.json({ success: true, rule: data });
    } catch (error) {
        console.error('[AutoLinkRules] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// DELETE - Remove rule
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID da regra obrigatório' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('payment_auto_link_rules')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[AutoLinkRules] Error deleting rule:', error);
            return NextResponse.json({ error: 'Erro ao deletar regra' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[AutoLinkRules] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
