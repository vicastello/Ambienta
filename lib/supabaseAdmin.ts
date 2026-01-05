// lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/supabase';

// URL pública do seu projeto (a mesma que você já usa no front)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// Chave SERVICE ROLE (NÃO é a anon) – usar só no backend
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl) {
  console.error('CRITICAL: NEXT_PUBLIC_SUPABASE_URL is missing in environment variables');
}

if (!serviceRoleKey) {
  console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing in environment variables');
}

// We create the client anyway, but it might fail on calls if keys are empty.
// This prevents the "Import Error" crash on startup, allowing /api/health to work and /api/debug to report the missing key.
export const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});

