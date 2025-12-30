import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Json } from '@/src/types/db-public';

export type AiActionLogInsert = {
  action_type: string;
  status: 'ok' | 'error' | 'pending';
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  screen?: string | null;
  source?: string | null;
};

export async function insertAiActionLog(entry: AiActionLogInsert) {
  const admin = supabaseAdmin as any;
  const { error } = await admin
    .from('ai_action_logs')
    .insert({
      action_type: entry.action_type,
      status: entry.status,
      payload: (entry.payload ?? null) as Json,
      result: (entry.result ?? null) as Json,
      error: entry.error ?? null,
      screen: entry.screen ?? null,
      source: entry.source ?? 'nerve_center',
    } as any);

  if (error) throw error;
}
