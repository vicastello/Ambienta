import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/db-public';
import { normalizeEnvValue } from '@/lib/env';

const supabaseUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
