import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Listar todos os períodos de taxas
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const marketplace = searchParams.get('marketplace');

    let query = supabase
        .from('marketplace_fee_periods')
        .select('*')
        .order('valid_from', { ascending: false });

    if (marketplace) {
        query = query.eq('marketplace', marketplace);
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// POST - Criar novo período de taxas
export async function POST(request: NextRequest) {
    const body = await request.json();

    const { data, error } = await supabase
        .from('marketplace_fee_periods')
        .insert({
            marketplace: body.marketplace,
            valid_from: body.valid_from,
            valid_to: body.valid_to || null,
            commission_percent: body.commission_percent || 0,
            service_fee_percent: body.service_fee_percent || 0,
            payment_fee_percent: body.payment_fee_percent || 0,
            fixed_fee_per_order: body.fixed_fee_per_order || 0,
            fixed_fee_per_product: body.fixed_fee_per_product || 0,
            shipping_fee_percent: body.shipping_fee_percent || 0,
            ads_fee_percent: body.ads_fee_percent || 0,
            notes: body.notes || null,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data, { status: 201 });
}

// PUT - Atualizar período existente
export async function PUT(request: NextRequest) {
    const body = await request.json();

    if (!body.id) {
        return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('marketplace_fee_periods')
        .update({
            marketplace: body.marketplace,
            valid_from: body.valid_from,
            valid_to: body.valid_to || null,
            commission_percent: body.commission_percent || 0,
            service_fee_percent: body.service_fee_percent || 0,
            payment_fee_percent: body.payment_fee_percent || 0,
            fixed_fee_per_order: body.fixed_fee_per_order || 0,
            fixed_fee_per_product: body.fixed_fee_per_product || 0,
            shipping_fee_percent: body.shipping_fee_percent || 0,
            ads_fee_percent: body.ads_fee_percent || 0,
            notes: body.notes || null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', body.id)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
}

// DELETE - Remover período
export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
    }

    const { error } = await supabase
        .from('marketplace_fee_periods')
        .delete()
        .eq('id', parseInt(id));

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
}
