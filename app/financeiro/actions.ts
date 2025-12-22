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
    // 1. Fetch Manual Entries
    let query = supabaseAdmin
        .from('cash_flow_entries')
        .select('*')
        .eq('source', 'manual');

    // Apply date filters to manual entries
    if (filters?.dataInicio) query = query.gte('due_date', filters.dataInicio);
    if (filters?.dataFim) query = query.lte('due_date', filters.dataFim);

    // Apply status filter
    if (filters?.statusPagamento === 'pagos') query = query.eq('status', 'confirmed');
    else if (filters?.statusPagamento === 'pendentes') query = query.in('status', ['pending', 'overdue']);

    // Apply search
    if (filters?.search) {
        query = query.or(`description.ilike.%${filters.search}%,entity_name.ilike.%${filters.search}%`);
    }

    const { data: manualEntries } = await query.order('due_date', { ascending: true }).limit(100);

    // 2. Fetch Orphan Import Entries (Marketplace Payments without tiny_order_id)
    let importQuery = supabaseAdmin
        .from('marketplace_payments')
        .select('*')
        .is('tiny_order_id', null);

    // Apply date filters to import entries
    if (filters?.dataInicio) importQuery = importQuery.gte('payment_date', filters.dataInicio);
    if (filters?.dataFim) importQuery = importQuery.lte('payment_date', filters.dataFim);

    // Apply status filter (all imports are confirmed/paid)
    if (filters?.statusPagamento === 'pendentes') {
        // If filtering for pending, imports (which are paid) should not be returned
        // So we return only manual entries
        return manualEntries || [];
    }

    if (filters?.search) {
        importQuery = importQuery.or(`transaction_description.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    const { data: orphanPayments } = await importQuery.order('payment_date', { ascending: true }).limit(100);

    // 3. Map orphans to ManualEntry shape
    const mappedOrphans = (orphanPayments || []).map((p: any) => {
        let description = p.transaction_description || p.description;

        // Fallback to raw_data analysis if description is missing
        if (!description && Array.isArray(p.raw_data) && p.raw_data.length > 2) {
            // For Shopee, index 2 usually contains "Renda do pedido #ID" or "Adjustment..."
            description = p.raw_data[2];
        } else if (!description && Array.isArray(p.raw_data) && p.raw_data.length > 1) {
            description = p.raw_data[1];
        }

        // Final fallback
        if (!description) {
            description = p.description || p.transaction_type || 'Lançamento Importado';
            if (p.marketplace_order_id) {
                description += ` (${p.marketplace_order_id})`;
            }
        }

        // Check for Ads/Recarga keywords but exclude refunds
        const descLower = description.toLowerCase();
        const isAdsOrRecharge = descLower.match(/recarga|ads|publicidade/) &&
            !descLower.match(/reembolso|estorno|cancelamento/);

        const isExpense = (p.net_amount || 0) < 0 || !!isAdsOrRecharge;

        return {
            id: p.id,
            description: description,
            amount: Math.abs(p.net_amount || 0),
            type: isExpense ? 'expense' : 'income',
            status: 'confirmed', // Imports are always settled
            due_date: p.payment_date,
            competence_date: p.payment_date,
            entity_name: p.marketplace ? p.marketplace.charAt(0).toUpperCase() + p.marketplace.slice(1) : 'Marketplace',
            category: 'Marketplace',
            subcategory: p.transaction_type || 'Importado',
            tags: ['import', p.marketplace],
            source: 'import'
        };
    });

    // 4. Combine and Sort
    const allEntries = [...(manualEntries || []), ...mappedOrphans];

    // Sort by due_date desc (newest first usually better for mix) or asc as requested
    // The previous implementation was 'asc'. Let's keep 'asc' but ensure stable sort.
    return allEntries.sort((a, b) => {
        const dateA = new Date(a.due_date).getTime();
        const dateB = new Date(b.due_date).getTime();
        return dateA - dateB;
    });
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
