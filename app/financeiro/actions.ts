'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const EntrySchema = z.object({
    type: z.enum(['income', 'expense']),
    amount: z.number().positive(),
    description: z.string().min(3),
    category: z.string(),
    subcategory: z.string().optional(),
    due_date: z.string().date(), // YYYY-MM-DD
    competence_date: z.string().date(), // YYYY-MM-DD
    status: z.enum(['pending', 'confirmed', 'overdue', 'cancelled']).default('pending'),
});

export type CreateManualEntryData = z.infer<typeof EntrySchema>;

/**
 * Creates a new manual entry in cash_flow_entries.
 */
export async function createManualEntry(data: CreateManualEntryData) {
    const parsed = EntrySchema.parse(data);

    const { error } = await supabaseAdmin
        .from('cash_flow_entries')
        .insert({
            source: 'manual',
            source_id: crypto.randomUUID(), // Unique ID for manual entry
            type: parsed.type,
            amount: parsed.amount,
            description: parsed.description,
            category: parsed.category,
            subcategory: parsed.subcategory,
            due_date: parsed.due_date,
            competence_date: parsed.competence_date,
            status: parsed.status,
        });

    if (error) {
        console.error('Error creating manual entry:', error);
        throw new Error('Falha ao criar lançamento manual.');
    }

    revalidatePath('/financeiro/fluxo-caixa');
}

/**
 * Updates an existing manual entry.
 */
export async function updateManualEntry(id: string, data: Partial<CreateManualEntryData>) {
    const { error } = await supabaseAdmin
        .from('cash_flow_entries')
        .update({
            ...data,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('source', 'manual'); // Security: ensure we only edit manual entries via this fn

    if (error) {
        throw new Error('Falha ao atualizar lançamento.');
    }

    revalidatePath('/financeiro/fluxo-caixa');
}

/**
 * Deletes a manual entry.
 */
export async function deleteManualEntry(id: string) {
    const { error } = await supabaseAdmin
        .from('cash_flow_entries')
        .delete()
        .eq('id', id)
        .eq('source', 'manual');

    if (error) {
        throw new Error('Falha ao excluir lançamento.');
    }

    revalidatePath('/financeiro/fluxo-caixa');
}

/**
 * Marks any entry (Manual or Synced) as Paid/Received.
 */
export async function markEntryAsPaid(id: string, paidDate: string) {
    const { error } = await supabaseAdmin
        .from('cash_flow_entries')
        .update({
            status: 'confirmed',
            paid_date: paidDate,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);

    if (error) {
        throw new Error('Falha ao baixar lançamento.');
    }

    revalidatePath('/financeiro/fluxo-caixa');
}

/**
 * Lists manual entries for display.
 */
export async function listManualEntries() {
    const { data } = await supabaseAdmin
        .from('cash_flow_entries')
        .select('*')
        .eq('source', 'manual')
        .order('due_date', { ascending: true })
        .limit(50);

    return data || [];
}

/**
 * Marks multiple tiny_orders as paid (for ReceivablesTable mass action)
 */
export async function markOrdersAsPaid(orderIds: number[]) {
    if (!orderIds.length) {
        throw new Error('Nenhum pedido selecionado.');
    }

    const now = new Date().toISOString();

    const { error, count } = await supabaseAdmin
        .from('tiny_orders')
        .update({
            payment_received: true,
            payment_received_at: now,
        })
        .in('id', orderIds);

    if (error) {
        console.error('Error marking orders as paid:', error);
        throw new Error('Falha ao marcar pedidos como pagos.');
    }

    revalidatePath('/financeiro/fluxo-caixa');

    return { updatedCount: count ?? orderIds.length };
}

