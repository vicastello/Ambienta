import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type {
  Database,
  SyncSettingsRow,
  SyncSettingsUpdate,
} from '@/src/types/db-public';

const SYNC_SETTINGS_ID = 1;

export type NormalizedCronSettings = {
  cron_dias_recent_orders: number;
  cron_produtos_limit: number;
  cron_enrich_enabled: boolean;
  cron_produtos_enabled: boolean;
  cron_produtos_enrich_estoque: boolean;
};

export const CRON_SETTINGS_DEFAULTS: NormalizedCronSettings = {
  cron_dias_recent_orders: 2,
  cron_produtos_limit: 30,
  cron_enrich_enabled: true,
  cron_produtos_enabled: true,
  cron_produtos_enrich_estoque: true,
};

type Tables = Database['public']['Tables'];
type SyncJobsRow = Tables['sync_jobs']['Row'];
type SyncLogsRow = Tables['sync_logs']['Row'];
type SyncJobsInsert = Tables['sync_jobs']['Insert'];
type SyncLogsInsert = Tables['sync_logs']['Insert'];

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
    .eq('id', SYNC_SETTINGS_ID);
  if (error) throw error;
}

export const normalizeCronSettings = (row?: SyncSettingsRow | null): NormalizedCronSettings => ({
  cron_dias_recent_orders: row?.cron_dias_recent_orders ?? CRON_SETTINGS_DEFAULTS.cron_dias_recent_orders,
  cron_produtos_limit: row?.cron_produtos_limit ?? CRON_SETTINGS_DEFAULTS.cron_produtos_limit,
  cron_enrich_enabled: row?.cron_enrich_enabled ?? CRON_SETTINGS_DEFAULTS.cron_enrich_enabled,
  cron_produtos_enabled: row?.cron_produtos_enabled ?? CRON_SETTINGS_DEFAULTS.cron_produtos_enabled,
  cron_produtos_enrich_estoque:
    row?.cron_produtos_enrich_estoque ?? CRON_SETTINGS_DEFAULTS.cron_produtos_enrich_estoque,
});

export async function getSyncSettings(): Promise<SyncSettingsRow | null> {
  const admin = supabaseAdmin as any;
  const { data, error } = await admin
    .from('sync_settings')
    .select('*')
    .eq('id', SYNC_SETTINGS_ID)
    .maybeSingle();

  if (error) throw error;
  return (data as SyncSettingsRow) ?? null;
}

export async function upsertSyncSettings(input: Partial<SyncSettingsRow>): Promise<SyncSettingsRow> {
  const admin = supabaseAdmin as any;
  const payload = {
    ...input,
    id: SYNC_SETTINGS_ID,
  } satisfies Partial<SyncSettingsRow>;

  const { data, error } = await admin
    .from('sync_settings')
    .upsert(payload as SyncSettingsUpdate, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;
  return data as SyncSettingsRow;
}

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
  return upsertSyncSettings(update);
}

// Execução de SQL bruto via RPC exec_sql (usa service role)
export async function runSqlStatement(statement: string) {
  const { error } = await (supabaseAdmin.rpc as any)('exec_sql', {
    query: statement.endsWith(';') ? statement : `${statement};`,
  });
  if (error) throw error;
}
