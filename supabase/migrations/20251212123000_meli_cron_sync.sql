-- Habilita cron/pg_net e agenda sync do Mercado Livre a cada 15 minutos
-- Para aplicar esta migration no projeto remoto:
-- supabase db push --linked
-- (NÃO usar supabase db reset --linked em produção)

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

set search_path = public, extensions;
set check_function_bodies = off;

create or replace function public.meli_sync_http()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url := 'https://gestao.ambientautilidades.com.br/api/marketplaces/mercado-livre/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-PgCron/1.0'
    ),
    body := jsonb_build_object('periodDays', 3),
    timeout_milliseconds := 55000
  )
  into v_request_id;

  insert into public.sync_logs (job_id, level, message, meta)
  values (
    null,
    'info',
    'meli_sync_http dispatched via pg_cron',
    jsonb_build_object(
      'request_id', to_jsonb(v_request_id),
      'url', 'https://gestao.ambientautilidades.com.br/api/marketplaces/mercado-livre/sync'
    )
  );
exception
  when others then
    raise warning 'Falha em meli_sync_http: %', sqlerrm;
    insert into public.sync_logs (job_id, level, message, meta)
    values (
      null,
      'error',
      'meli_sync_http falhou',
      jsonb_build_object('error', sqlerrm)
    );
end;
$$;

-- Remove job existente (se houver) antes de recriar
select cron.unschedule('meli_orders_sync_15min')
where exists (select 1 from cron.job where jobname = 'meli_orders_sync_15min');

-- Agenda execução automática a cada 15 minutos
select cron.schedule(
  'meli_orders_sync_15min',
  '*/15 * * * *',
  $$select public.meli_sync_http();$$
);
