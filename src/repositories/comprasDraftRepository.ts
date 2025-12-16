import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { ComprasDraftRow, ComprasDraftUpsert } from '@/src/types/db-public';
import type { ManualItem } from '@/app/compras/types';

const TABLE_NAME = 'compras_drafts' as const;
const DEFAULT_DRAFT_KEY = 'default';

export interface DraftData {
    pedidoOverrides: Record<number, number>;
    manualItems: ManualItem[];
    currentOrderName: string;
    selectedIds?: Record<number, boolean>;
    periodDays?: number;
    targetDays?: number;
    updatedAt: string;
}

const normalizeRow = (row: ComprasDraftRow): DraftData => ({
    pedidoOverrides: (row.pedido_overrides as Record<number, number>) ?? {},
    manualItems: (row.manual_items as ManualItem[]) ?? [],
    currentOrderName: row.current_order_name ?? '',
    selectedIds: (row.selected_ids as Record<number, boolean>) ?? {},
    periodDays: row.period_days ?? undefined,
    targetDays: row.target_days ?? undefined,
    updatedAt: row.updated_at,
});

export async function getDraft(draftKey = DEFAULT_DRAFT_KEY): Promise<DraftData | null> {
    const { data, error } = await supabaseAdmin
        .from(TABLE_NAME)
        .select('*')
        .eq('draft_key', draftKey)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return normalizeRow(data as unknown as ComprasDraftRow);
}

export async function upsertDraft(
    payload: Partial<DraftData>,
    draftKey = DEFAULT_DRAFT_KEY
): Promise<DraftData> {
    const insertPayload: ComprasDraftUpsert = {
        draft_key: draftKey,
        pedido_overrides: payload.pedidoOverrides ?? {},
        manual_items: payload.manualItems ?? [],
        current_order_name: payload.currentOrderName ?? '',
        selected_ids: payload.selectedIds ?? {},
        period_days: payload.periodDays,
        target_days: payload.targetDays,
    } as unknown as ComprasDraftUpsert;

    const { data, error } = await supabaseAdmin
        .from(TABLE_NAME)
        .upsert(insertPayload, { onConflict: 'draft_key' })
        .select()
        .single();

    if (error) throw error;
    return normalizeRow(data as unknown as ComprasDraftRow);
}

export async function deleteDraft(draftKey = DEFAULT_DRAFT_KEY): Promise<void> {
    const { error } = await supabaseAdmin
        .from(TABLE_NAME)
        .delete()
        .eq('draft_key', draftKey);

    if (error) throw error;
}
