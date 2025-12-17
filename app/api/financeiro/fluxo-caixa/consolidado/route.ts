import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * API Route: /api/financeiro/fluxo-caixa/consolidado
 * 
 * Returns all cash flow entries (Tiny, Purchase Orders, Manual)
 * from the central `cash_flow_entries` table.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);

        // Pagination
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '30');
        const offset = (page - 1) * limit;

        // Filters
        const tipo = searchParams.get('tipo') || 'todos'; // income, expense, todos
        const status = searchParams.get('status') || 'todos'; // pending, confirmed, overdue, cancelled, todos
        const source = searchParams.get('source') || 'todos'; // tiny_order, purchase_order, manual, todos
        const dataInicio = searchParams.get('dataInicio');
        const dataFim = searchParams.get('dataFim');

        // Build Query
        let query = supabaseAdmin
            .from('cash_flow_entries')
            .select('*', { count: 'exact' });

        // Apply Filters
        if (tipo !== 'todos') {
            query = query.eq('type', tipo);
        }
        if (status !== 'todos') {
            query = query.eq('status', status);
        }
        if (source !== 'todos') {
            query = query.eq('source', source);
        }
        if (dataInicio) {
            query = query.gte('due_date', dataInicio);
        }
        if (dataFim) {
            query = query.lte('due_date', dataFim);
        }

        // Order and Paginate
        query = query.order('due_date', { ascending: true });
        query = query.range(offset, offset + limit - 1);

        const { data, count, error } = await query;

        if (error) {
            console.error('[Consolidado API] Error:', error);
            throw error;
        }

        // Calculate Summary
        const summaryQuery = supabaseAdmin
            .from('cash_flow_entries')
            .select('type, amount, status');

        // Apply same filters for summary
        let summaryQ = summaryQuery;
        if (tipo !== 'todos') summaryQ = summaryQ.eq('type', tipo);
        if (status !== 'todos') summaryQ = summaryQ.eq('status', status);
        if (source !== 'todos') summaryQ = summaryQ.eq('source', source);
        if (dataInicio) summaryQ = summaryQ.gte('due_date', dataInicio);
        if (dataFim) summaryQ = summaryQ.lte('due_date', dataFim);

        const { data: summaryData } = await summaryQ;

        const summary = {
            totalReceitas: 0,
            totalDespesas: 0,
            saldo: 0,
            pendente: 0,
            confirmado: 0,
        };

        (summaryData || []).forEach((entry: any) => {
            const amount = entry.amount || 0;
            if (entry.type === 'income') {
                summary.totalReceitas += amount;
            } else {
                summary.totalDespesas += amount;
            }
            if (entry.status === 'confirmed') {
                summary.confirmado += amount;
            } else if (entry.status === 'pending' || entry.status === 'overdue') {
                summary.pendente += amount;
            }
        });
        summary.saldo = summary.totalReceitas - summary.totalDespesas;

        return NextResponse.json({
            entries: data || [],
            meta: {
                total: count,
                page,
                limit,
                totalPages: count ? Math.ceil(count / limit) : 0,
                summary,
            },
        });
    } catch (error: any) {
        console.error('[Consolidado API] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno: ' + error.message }, { status: 500 });
    }
}
