'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { revalidatePath } from 'next/cache';

// Cast to any until migration is synced to Supabase types
const db = supabaseAdmin as any;

export type RecurringEntry = {
    id: string;
    type: 'income' | 'expense';
    description: string;
    amount: number;
    category: string | null;
    subcategory: string | null;
    frequency: 'weekly' | 'monthly' | 'yearly';
    day_of_month: number | null;
    day_of_week: number | null;
    is_active: boolean;
    next_due_date: string | null;
    entity_name: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

export type CreateRecurringEntryData = {
    type: 'income' | 'expense';
    description: string;
    amount: number;
    category?: string;
    subcategory?: string;
    frequency?: 'weekly' | 'monthly' | 'yearly';
    day_of_month?: number;
    day_of_week?: number;
    entity_name?: string;
    notes?: string;
};

/**
 * List all recurring entries
 */
export async function listRecurringEntries(): Promise<RecurringEntry[]> {
    const { data, error } = await db
        .from('recurring_entries')
        .select('*')
        .order('is_active', { ascending: false })
        .order('next_due_date', { ascending: true });

    if (error) {
        console.error('Error listing recurring entries:', error);
        throw new Error('Falha ao listar recorrências');
    }

    return data || [];
}

/**
 * Create a new recurring entry
 */
export async function createRecurringEntry(data: CreateRecurringEntryData) {
    const { error } = await db
        .from('recurring_entries')
        .insert({
            type: data.type,
            description: data.description,
            amount: data.amount,
            category: data.category || null,
            subcategory: data.subcategory || null,
            frequency: data.frequency || 'monthly',
            day_of_month: data.day_of_month || null,
            day_of_week: data.day_of_week || null,
            entity_name: data.entity_name || null,
            notes: data.notes || null,
            is_active: true,
        });

    if (error) {
        console.error('Error creating recurring entry:', error);
        throw new Error('Falha ao criar recorrência');
    }

    revalidatePath('/financeiro/fluxo-caixa');
}

/**
 * Update a recurring entry
 */
export async function updateRecurringEntry(id: string, data: Partial<CreateRecurringEntryData & { is_active: boolean }>) {
    const { error } = await db
        .from('recurring_entries')
        .update({
            ...data,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);

    if (error) {
        console.error('Error updating recurring entry:', error);
        throw new Error('Falha ao atualizar recorrência');
    }

    revalidatePath('/financeiro/fluxo-caixa');
}

/**
 * Delete a recurring entry
 */
export async function deleteRecurringEntry(id: string) {
    const { error } = await db
        .from('recurring_entries')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting recurring entry:', error);
        throw new Error('Falha ao excluir recorrência');
    }

    revalidatePath('/financeiro/fluxo-caixa');
}

/**
 * Toggle active status of a recurring entry
 */
export async function toggleRecurringEntry(id: string, isActive: boolean) {
    const { error } = await db
        .from('recurring_entries')
        .update({
            is_active: isActive,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);

    if (error) {
        console.error('Error toggling recurring entry:', error);
        throw new Error('Falha ao alterar status da recorrência');
    }

    revalidatePath('/financeiro/fluxo-caixa');
}

/**
 * Generate cash_flow_entries from due recurring entries
 * This should be called by a cron job daily
 */
export async function generateRecurringEntries() {
    const today = new Date().toISOString().split('T')[0];

    // Get all active recurring entries with next_due_date <= today
    const { data: dueEntries, error: fetchError } = await db
        .from('recurring_entries')
        .select('*')
        .eq('is_active', true)
        .lte('next_due_date', today);

    if (fetchError) {
        console.error('Error fetching due recurring entries:', fetchError);
        throw fetchError;
    }

    if (!dueEntries?.length) {
        return { generated: 0 };
    }

    let generated = 0;

    for (const entry of dueEntries) {
        // Create cash_flow_entry
        const { error: insertError } = await supabaseAdmin
            .from('cash_flow_entries')
            .insert({
                source: 'recurring',
                source_id: entry.id,
                type: entry.type,
                amount: entry.amount,
                description: entry.description,
                category: entry.category,
                subcategory: entry.subcategory,
                due_date: entry.next_due_date,
                competence_date: entry.next_due_date,
                status: 'pending',
            });

        if (insertError) {
            console.error(`Error generating entry for ${entry.id}:`, insertError);
            continue;
        }

        // Update last_generated_at (trigger will auto-calculate next_due_date)
        await db
            .from('recurring_entries')
            .update({
                last_generated_at: new Date().toISOString(),
            })
            .eq('id', entry.id);

        generated++;
    }

    revalidatePath('/financeiro/fluxo-caixa');
    return { generated };
}

