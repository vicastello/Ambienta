/**
 * Script para criar a tabela tiny_tokens que falta
 * Run with: node setup-tiny-tokens.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://znoiauhdrujwkfryhwiz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpub2lhdWhkcnVqd2tmcnlod2l6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzM5ODEyNywiZXhwIjoyMDc4OTc0MTI3fQ.J1GFCdU1Fb9Jc5NlQSHkI7vsvXPWbE3l6h-17KLPsZQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function setup() {
  try {
    console.log('🔧 Preparando tabela tiny_tokens...\n');

    // Try to create the table using Supabase functions
    // Unfortunately, Supabase doesn't expose raw SQL execution via JS client
    // But we can try to insert a row and it will fail with a helpful error if table doesn't exist

    const { data, error } = await supabase
      .from('tiny_tokens')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error && error.code === 'PGRST205') {
      console.log('❌ Tabela tiny_tokens não encontrada');
      console.log('\n📝 INSTRUÇÕES PARA CRIAR A TABELA:\n');
      console.log('1. Acesse: https://app.supabase.com/project/znoiauhdrujwkfryhwiz');
      console.log('2. Vá para: SQL Editor');
      console.log('3. Execute este SQL:\n');

      const sql = `
create extension if not exists pgcrypto;

create table if not exists public.tiny_tokens (
  id integer primary key default 1,
  access_token text,
  refresh_token text,
  expires_at bigint,
  scope text,
  token_type text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into public.tiny_tokens (id) values (1) on conflict (id) do nothing;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tiny_tokens_updated_at on public.tiny_tokens;
create trigger trg_tiny_tokens_updated_at
before update on public.tiny_tokens
for each row
execute function public.set_updated_at();
      `;

      console.log(sql);
      console.log('\n4. Após criar a tabela, execute a autenticação do Tiny');
      console.log('   Acesse: http://localhost:3000/login');
      console.log('   Click em "Conectar com Tiny"\n');

      return;
    }

    if (error) {
      throw error;
    }

    if (data) {
      console.log('✅ Tabela tiny_tokens existe!');
      console.log('Token atual:');
      console.log({
        id: data.id,
        access_token: data.access_token ? '✓ Existe' : '✗ Vazio',
        refresh_token: data.refresh_token ? '✓ Existe' : '✗ Vazio',
        expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : 'null',
      });
      return;
    }

    console.log('⚠️ Tabela existe mas sem dados na linha 1');

  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

setup();
