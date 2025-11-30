'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/db-public';

let cachedSupabase: SupabaseClient<Database> | null = null;

async function getSupabaseClient() {
  if (!cachedSupabase) {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase env vars ausentes');
    }

    cachedSupabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
  }

  return cachedSupabase;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@gestor.local'); // já preenche pro teste
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const supabase = await getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      console.error(error);
      setErrorMsg(error.message);
      return;
    }

    // Login OK → manda pra dashboard (que já já vamos criar)
    router.push('/dashboard');
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg-page)] text-[var(--text-main)] px-4">
      <div className="surface-panel surface-panel-soft w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-3">
          <div className="relative mx-auto h-12 w-48">
            <Image
              src="/brand/logo-horizontal-light.svg"
              alt="Ambienta Tiny Gestor"
              fill
              className="object-contain dark:hidden"
              sizes="192px"
              priority
            />
            <Image
              src="/brand/logo-horizontal-dark.svg"
              alt="Ambienta Tiny Gestor"
              fill
              className="object-contain hidden dark:block"
              sizes="192px"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold">Login – Gestor Tiny</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              className="w-full app-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              className="w-full app-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {errorMsg && (
            <p className="text-rose-500 text-sm">
              Erro ao entrar: {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-full font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition disabled:opacity-60"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-xs text-muted text-center">
          Use o e-mail e a senha cadastrados no Supabase.
        </p>
      </div>
    </main>
  );
}
