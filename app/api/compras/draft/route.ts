import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { getDraft, upsertDraft, deleteDraft } from '@/src/repositories/comprasDraftRepository';

/**
 * GET /api/compras/draft
 * Retorna o rascunho atual (ou null se não existir)
 */
export async function GET() {
    try {
        const draft = await getDraft();
        return NextResponse.json({ draft });
    } catch (error) {
        const message = getErrorMessage(error) ?? 'Erro ao buscar rascunho';
        console.error('[API Compras/Draft][GET]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * PUT /api/compras/draft
 * Salva/atualiza o rascunho atual (upsert por draft_key)
 */
export async function PUT(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));

        const payload = {
            pedidoOverrides: body.pedidoOverrides ?? {},
            manualItems: Array.isArray(body.manualItems) ? body.manualItems : [],
            currentOrderName: typeof body.currentOrderName === 'string' ? body.currentOrderName : '',
            selectedIds: body.selectedIds ?? {},
            periodDays: body.periodDays,
            targetDays: body.targetDays,
        };

        const draft = await upsertDraft(payload);
        return NextResponse.json({ draft });
    } catch (error) {
        const message = getErrorMessage(error) ?? 'Erro ao salvar rascunho';
        console.error('[API Compras/Draft][PUT]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * DELETE /api/compras/draft
 * Limpa o rascunho atual
 */
export async function DELETE() {
    try {
        await deleteDraft();
        return NextResponse.json({ success: true });
    } catch (error) {
        const message = getErrorMessage(error) ?? 'Erro ao limpar rascunho';
        console.error('[API Compras/Draft][DELETE]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
