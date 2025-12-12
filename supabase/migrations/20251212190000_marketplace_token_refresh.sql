-- Tokens e agendamentos de refresh para Shopee e Mercado Livre
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

set search_path = public, extensions;
set check_function_bodies = off;

-- =======================
-- TABELAS DE TOKENS
-- =======================
create table if not exists meli_tokens (
  id integer primary key default 1 check (id = 1),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists shopee_tokens (
  id integer primary key default 1 check (id = 1),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- =======================
-- FUNÇÕES HTTP PARA REFRESH
-- =======================
create or replace function public.meli_refresh_token_http()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
  v_base_url text := coalesce(current_setting('app.settings.base_url', true), 'https://gestao.ambientautilidades.com.br');
begin
  select net.http_post(
    url := v_base_url || '/api/marketplaces/mercado-livre/refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-PgCron/1.0'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  into v_request_id;

  insert into public.sync_logs (job_id, level, message, meta)
  values (
    null,
    'info',
    'meli_refresh_token_http dispatched via pg_cron',
    jsonb_build_object('request_id', to_jsonb(v_request_id))
  );
exception
  when others then
    insert into public.sync_logs (job_id, level, message, meta)
    values (
      null,
      'error',
      'meli_refresh_token_http falhou',
      jsonb_build_object('error', sqlerrm)
    );
end;
$$;

create or replace function public.shopee_refresh_token_http()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
  v_base_url text := coalesce(current_setting('app.settings.base_url', true), 'https://gestao.ambientautilidades.com.br');
begin
  select net.http_post(
    url := v_base_url || '/api/marketplaces/shopee/refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-PgCron/1.0'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  into v_request_id;

  insert into public.sync_logs (job_id, level, message, meta)
  values (
    null,
    'info',
    'shopee_refresh_token_http dispatched via pg_cron',
    jsonb_build_object('request_id', to_jsonb(v_request_id))
  );
exception
  when others then
    insert into public.sync_logs (job_id, level, message, meta)
    values (
      null,
      'error',
      'shopee_refresh_token_http falhou',
      jsonb_build_object('error', sqlerrm)
    );
end;
$$;

-- =======================
-- AGENDAMENTOS PG_CRON
-- =======================
select cron.unschedule('meli_refresh_token_6h')
where exists (select 1 from cron.job where jobname = 'meli_refresh_token_6h');

select cron.schedule(
  'meli_refresh_token_6h',
  '0 */6 * * *',
  $$select public.meli_refresh_token_http();$$
);

select cron.unschedule('shopee_refresh_token_3h')
where exists (select 1 from cron.job where jobname = 'shopee_refresh_token_3h');

select cron.schedule(
  'shopee_refresh_token_3h',
  '0 */3 * * *',
  $$select public.shopee_refresh_token_http();$$
);
