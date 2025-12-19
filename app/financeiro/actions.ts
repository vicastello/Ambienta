'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Cast to any for tags column until types are synced
const db = supabaseAdmin as any;

const EntrySchema = z.object({
    type: z.enum(['income', 'expense']),
    amount: z.number().positive(),
    description: z.string().min(3),
    category: z.string(),
    subcategory: z.string().optional(),
    due_date: z.string().date(), // YYYY-MM-DD
    competence_date: z.string().date(), // YYYY-MM-DD
    status: z.enum(['pending', 'confirmed', 'overdue', 'cancelled']).default('pending'),
    tags: z.array(z.string()).default([]),
    // New fields
    entity_name: z.string().optional(),
    entity_type: z.enum(['client', 'supplier', 'employee', 'bank', 'government', 'other']).optional(),
    category_id: z.string().uuid().optional(),
    cost_center: z.string().optional(),
    paid_date: z.string().date().optional().nullable(),
    notes: z.string().optional(),
});

export type CreateManualEntryData = z.infer<typeof EntrySchema>;

/**
 * Creates a new manual entry in cash_flow_entries.
 */
export async function createManualEntry(data: CreateManualEntryData) {
    const parsed = EntrySchema.parse(data);

    // Filter out empty strings for optional dates/fields
    const payload = {
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
        tags: parsed.tags,
        // New fields
        entity_name: parsed.entity_name || null,
        entity_type: parsed.entity_type || null,
        category_id: parsed.category_id || null,
        cost_center: parsed.cost_center || null,
        paid_date: parsed.paid_date || null,
        notes: parsed.notes || null,
    };

    const { error } = await db
        .from('cash_flow_entries')
        .insert(payload);

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
 * Lists manual entries for display with optional filters.
 */
export async function listManualEntries(filters?: {
    dataInicio?: string;
    dataFim?: string;
    statusPagamento?: 'todos' | 'pagos' | 'pendentes';
    search?: string;
}) {
    let query = supabaseAdmin
        .from('cash_flow_entries')
        .select('*')
        .eq('source', 'manual');

    // Apply date filters
    if (filters?.dataInicio) {
        query = query.gte('due_date', filters.dataInicio);
    }
    if (filters?.dataFim) {
        query = query.lte('due_date', filters.dataFim);
    }

    // Apply status filter
    if (filters?.statusPagamento === 'pagos') {
        query = query.eq('status', 'confirmed');
    } else if (filters?.statusPagamento === 'pendentes') {
        query = query.in('status', ['pending', 'overdue']);
    }

    // Apply search filter (description or entity_name)
    if (filters?.search) {
        query = query.or(`description.ilike.%${filters.search}%,entity_name.ilike.%${filters.search}%`);
    }

    query = query.order('due_date', { ascending: true }).limit(100);

    const { data } = await query;
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

/**
 * Marks multiple tiny_orders as unpaid/pending (reverses payment status)
 */
export async function markOrdersAsUnpaid(orderIds: number[]) {
    if (!orderIds.length) {
        throw new Error('Nenhum pedido selecionado.');
    }

    const { error, count } = await supabaseAdmin
        .from('tiny_orders')
        .update({
            payment_received: false,
            payment_received_at: null,
        })
        .in('id', orderIds);

    if (error) {
        console.error('Error marking orders as unpaid:', error);
        throw new Error('Falha ao marcar pedidos como pendentes.');
    }

    revalidatePath('/financeiro/fluxo-caixa');

    return { updatedCount: count ?? orderIds.length };
}
