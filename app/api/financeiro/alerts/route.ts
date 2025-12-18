// API route for financial alerts configuration and history
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const db = supabaseAdmin as any;

// GET - Get alert configurations and recent alerts
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type'); // config | history
        const unreadOnly = searchParams.get('unread') === 'true';
        const limit = parseInt(searchParams.get('limit') || '50');

        if (type === 'history') {
            // Get alert history
            let query = db
                .from('alert_history')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (unreadOnly) {
                query = query.eq('is_read', false);
            }

            const { data, error } = await query;

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            const unreadCount = data?.filter((a: any) => !a.is_read).length || 0;

            return NextResponse.json({
                alerts: data || [],
                unreadCount,
            });
        }

        // Get alert configurations
        const { data, error } = await db
            .from('financial_alerts')
            .select('*')
            .order('alert_type');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ configs: data || [] });
    } catch (error) {
        console.error('[alerts] Error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// PUT - Update alert configuration
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updateData } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
        }

        updateData.updated_at = new Date().toISOString();

        const { data, error } = await db
            .from('financial_alerts')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ config: data });
    } catch (error) {
        console.error('[alerts] Update error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

// POST - Create manual alert or mark alerts as read
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, alertIds, ...alertData } = body;

        if (action === 'mark_read') {
            // Mark alerts as read
            if (!alertIds || !alertIds.length) {
                return NextResponse.json({ error: 'IDs obrigatórios' }, { status: 400 });
            }

            const { error } = await db
                .from('alert_history')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .in('id', alertIds);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, marked: alertIds.length });
        }

        if (action === 'dismiss') {
            // Dismiss alerts
            if (!alertIds || !alertIds.length) {
                return NextResponse.json({ error: 'IDs obrigatórios' }, { status: 400 });
            }

            const { error } = await db
                .from('alert_history')
                .update({ is_dismissed: true, is_read: true })
                .in('id', alertIds);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, dismissed: alertIds.length });
        }

        // Create manual alert
        const { data, error } = await db
            .from('alert_history')
            .insert({
                alert_type: alertData.alert_type || 'info',
                title: alertData.title,
                message: alertData.message,
                severity: alertData.severity || 'info',
                related_entries: alertData.related_entries,
                related_orders: alertData.related_orders,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ alert: data }, { status: 201 });
    } catch (error) {
        console.error('[alerts] Create error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
