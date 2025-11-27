/**
 * Lê o checkpoint incremental de pedidos Tiny salvo em sync_settings (campo tiny_orders_incremental).
 * Sempre usa a linha id=1.
 */
export async function getTinyOrdersIncrementalConfig() {
  const { data, error } = await supabaseAdmin
    .from('sync_settings')
    .select('tiny_orders_incremental')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.tiny_orders_incremental || null;
}

/**
 * Atualiza o checkpoint incremental de pedidos Tiny em sync_settings (campo tiny_orders_incremental).
 * Sempre usa a linha id=1.
 * @param lastUpdatedAt string | Date - data ISO ou objeto Date
 */
export async function updateTinyOrdersIncrementalCheckpoint(lastUpdatedAt: string | Date) {
  const value = typeof lastUpdatedAt === 'string' ? lastUpdatedAt : lastUpdatedAt.toISOString();
  const patch: Record<string, any> = { tiny_orders_incremental: { lastUpdatedAt: value } };
  const admin = supabaseAdmin as any;
  const { error } = await admin
    .from('sync_settings')
    .update(patch)
    .eq('id', 1);
  if (error) throw error;
}
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Database } from '@/src/types/db-public';

type SyncJobsRow = Database['public']['Tables']['sync_jobs']['Row'];
type SyncLogsRow = Database['public']['Tables']['sync_logs']['Row'];
type SyncSettingsRow = Database['public']['Tables']['sync_settings']['Row'];
type SyncJobsInsert = Database['public']['Tables']['sync_jobs']['Insert'];
type SyncLogsInsert = Database['public']['Tables']['sync_logs']['Insert'];
type SyncSettingsUpdate = Database['public']['Tables']['sync_settings']['Update'];

export async function createSyncJob(data: SyncJobsInsert) {
  const admin = supabaseAdmin as any;
  const { data: inserted, error } = await admin
    .from('sync_jobs')
    .insert(data as any)
    .select('*')
    .single();

  if (error) throw error;
  return inserted as SyncJobsRow;
}

export async function insertSyncLog(data: SyncLogsInsert) {
  const admin = supabaseAdmin as any;
  const { data: inserted, error } = await admin
    .from('sync_logs')
    .insert(data as any)
    .select('*')
    .single();

  if (error) throw error;
  return inserted as SyncLogsRow;
}

export async function updateSyncSettings(update: SyncSettingsUpdate) {
  const admin = supabaseAdmin as any;
  const { data, error } = await admin
    .from('sync_settings')
    .update(update as any)
    .eq('id', 1)
    .select('*')
    .single();

  if (error) throw error;
  return data as SyncSettingsRow;
}

// Execução de SQL bruto via RPC exec_sql (usa service role)
export async function runSqlStatement(statement: string) {
  const { error } = await supabaseAdmin.rpc('exec_sql', {
    query: statement.endsWith(';') ? statement : `${statement};`,
  } as any);
  if (error) throw error;
}
