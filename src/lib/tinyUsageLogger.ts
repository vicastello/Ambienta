import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { TinyApiUsageInsert } from '@/src/types/db-public';

type LogTinyUsageInput = {
  context: string;
  endpoint: string;
  method?: string;
  statusCode?: number | null;
  success?: boolean | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export async function logTinyUsage(input: LogTinyUsageInput): Promise<void> {
  const payload: TinyApiUsageInsert = {
    context: input.context,
    endpoint: input.endpoint,
    method: input.method ?? 'GET',
    status_code: input.statusCode ?? null,
    success: input.success ?? null,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
  };

  try {
    await supabaseAdmin.from('tiny_api_usage').insert(payload);
  } catch (error) {
    console.error('[tinyUsageLogger] falha ao gravar log', error);
  }
}
