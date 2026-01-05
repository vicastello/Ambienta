/**
 * Rule Publish API
 * 
 * Endpoints for managing draft/published workflow
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

interface PublishRequest {
    ruleId: string;
    action: 'publish' | 'save_draft' | 'discard_draft';
    draftData?: Record<string, unknown>;
}

/**
 * POST /api/financeiro/rules/publish
 * 
 * Manage draft/publish workflow:
 * - publish: Publish a draft rule or apply pending draft changes
 * - save_draft: Save changes to draft_data without publishing
 * - discard_draft: Discard pending draft changes
 */
export async function POST(request: NextRequest) {
    try {
        const body: PublishRequest = await request.json();
        const { ruleId, action, draftData } = body;

        if (!ruleId) {
            return NextResponse.json({
                success: false,
                error: 'ruleId é obrigatório',
            }, { status: 400 });
        }

        // Fetch current rule
        const { data: rule, error: fetchError } = await supabaseAdmin
            .from('auto_rules' as any)
            .select('*')
            .eq('id', ruleId)
            .single();

        if (fetchError || !rule) {
            return NextResponse.json({
                success: false,
                error: 'Regra não encontrada',
            }, { status: 404 });
        }

        switch (action) {
            case 'publish': {
                // Try RPC function first
                const { data: rpcResult, error: rpcError } = await supabaseAdmin
                    .rpc('publish_rule' as any, { p_rule_id: ruleId });

                if (!rpcError && rpcResult?.success) {
                    return NextResponse.json({
                        success: true,
                        message: 'Regra publicada com sucesso',
                        ...rpcResult,
                    });
                }

                // Fallback: Manual publish
                const updateData: Record<string, unknown> = {
                    status: 'published',
                    published_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };

                // If has draft_data, apply it
                if ((rule as any).draft_data) {
                    const draft = (rule as any).draft_data as Record<string, unknown>;
                    if (draft.name) updateData.name = draft.name;
                    if (draft.description !== undefined) updateData.description = draft.description;
                    if (draft.conditions) updateData.conditions = draft.conditions;
                    if (draft.condition_logic) updateData.condition_logic = draft.condition_logic;
                    if (draft.actions) updateData.actions = draft.actions;
                    if (draft.priority !== undefined) updateData.priority = draft.priority;
                    if (draft.stop_on_match !== undefined) updateData.stop_on_match = draft.stop_on_match;
                    if (draft.marketplaces) updateData.marketplaces = draft.marketplaces;
                    updateData.draft_data = null;
                    updateData.version = ((rule as any).version || 1) + 1;
                }

                const { error: updateError } = await supabaseAdmin
                    .from('auto_rules' as any)
                    .update(updateData)
                    .eq('id', ruleId);

                if (updateError) {
                    console.error('[Publish] Error:', updateError);
                    return NextResponse.json({
                        success: false,
                        error: 'Erro ao publicar regra',
                    }, { status: 500 });
                }

                return NextResponse.json({
                    success: true,
                    message: 'Regra publicada com sucesso',
                    action: 'published',
                    newVersion: (rule as any).draft_data ? ((rule as any).version || 1) + 1 : (rule as any).version || 1,
                });
            }

            case 'save_draft': {
                if (!draftData) {
                    return NextResponse.json({
                        success: false,
                        error: 'draftData é obrigatório para save_draft',
                    }, { status: 400 });
                }

                const { error: updateError } = await supabaseAdmin
                    .from('auto_rules' as any)
                    .update({
                        draft_data: draftData,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', ruleId);

                if (updateError) {
                    console.error('[SaveDraft] Error:', updateError);
                    return NextResponse.json({
                        success: false,
                        error: 'Erro ao salvar rascunho',
                    }, { status: 500 });
                }

                return NextResponse.json({
                    success: true,
                    message: 'Rascunho salvo',
                    hasDraft: true,
                });
            }

            case 'discard_draft': {
                const { error: updateError } = await supabaseAdmin
                    .from('auto_rules' as any)
                    .update({
                        draft_data: null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', ruleId);

                if (updateError) {
                    console.error('[DiscardDraft] Error:', updateError);
                    return NextResponse.json({
                        success: false,
                        error: 'Erro ao descartar rascunho',
                    }, { status: 500 });
                }

                return NextResponse.json({
                    success: true,
                    message: 'Rascunho descartado',
                    hasDraft: false,
                });
            }

            default:
                return NextResponse.json({
                    success: false,
                    error: `Ação desconhecida: ${action}`,
                }, { status: 400 });
        }
    } catch (error) {
        console.error('[Publish] Unexpected error:', error);
        return NextResponse.json({
            success: false,
            error: 'Erro interno',
        }, { status: 500 });
    }
}
