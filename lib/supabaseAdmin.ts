// lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/db-public';

// URL pública do seu projeto (a mesma que você já usa no front)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Chave SERVICE ROLE (NÃO é a anon) – usar só no backend
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL não definida no .env');
}

if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não definida no .env');
}

export const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});
