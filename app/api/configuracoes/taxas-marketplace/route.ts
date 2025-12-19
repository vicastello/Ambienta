import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { clearFeeConfigCache } from '@/lib/marketplace-fees';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const marketplace = searchParams.get('marketplace');

        let query = supabase.from('marketplace_fee_config').select('*');

        if (marketplace) {
            query = query.eq('marketplace', marketplace).single();
        }

        const { data, error } = await query;

        if (error) {
            console.error('[API] Error fetching fee config:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[API] Error in GET /api/configuracoes/taxas-marketplace:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { marketplace, config } = body;

        if (!marketplace || !config) {
            return NextResponse.json(
                { error: 'marketplace and config are required' },
                { status: 400 }
            );
        }

        // Validate marketplace
        const validMarketplaces = ['shopee', 'mercado_livre', 'magalu'];
        if (!validMarketplaces.includes(marketplace)) {
            return NextResponse.json(
                { error: 'Invalid marketplace' },
                { status: 400 }
            );
        }

        // Update config
        const { data, error } = await supabase
            .from('marketplace_fee_config')
            .update({ config, updated_at: new Date().toISOString() })
            .eq('marketplace', marketplace)
            .select()
            .single();

        if (error) {
            console.error('[API] Error updating fee config:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Clear cache for this marketplace
        clearFeeConfigCache(marketplace);

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[API] Error in PUT /api/configuracoes/taxas-marketplace:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
