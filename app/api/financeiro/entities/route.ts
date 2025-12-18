// API route to get unique entity names for autocomplete
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Interface for entity suggestion
interface EntitySuggestion {
    name: string;
    type: string | null;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q') || '';

        // Get unique cliente_nome from tiny_orders
        const { data: orderClients, error: orderError } = await supabaseAdmin
            .from('tiny_orders')
            .select('cliente_nome')
            .not('cliente_nome', 'is', null)
            .not('cliente_nome', 'eq', '')
            .ilike('cliente_nome', `%${query}%`)
            .limit(30);

        if (orderError) {
            console.error('[entities] Error fetching from tiny_orders:', orderError);
        }

        // Combine and deduplicate
        const entityMap = new Map<string, EntitySuggestion>();

        orderClients?.forEach((o: any) => {
            if (o.cliente_nome && !entityMap.has(o.cliente_nome.toLowerCase())) {
                entityMap.set(o.cliente_nome.toLowerCase(), {
                    name: o.cliente_nome,
                    type: 'client'
                });
            }
        });

        const suggestions = Array.from(entityMap.values())
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
            .slice(0, 15);

        return NextResponse.json({ suggestions });
    } catch (error: any) {
        console.error('[entities] Error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
