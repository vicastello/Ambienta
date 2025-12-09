-- Habilita cron/pg_net e agenda sync da Shopee a cada 5 minutos
-- Para aplicar esta migration no projeto remoto:
-- supabase db push --linked
-- (NÃO usar supabase db reset --linked em produção)

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

set search_path = public, extensions;
set check_function_bodies = off;

create or replace function public.shopee_sync_http()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url := 'https://gestao.ambientautilidades.com.br/api/marketplaces/shopee/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-PgCron/1.0'
    ),
    body := jsonb_build_object('periodDays', 3), -- Últimos 3 dias para sync incremental
    timeout_milliseconds := 120000 -- 2 minutos timeout (Shopee pode ser lenta)
  )
  into v_request_id;

  insert into public.sync_logs (job_id, level, message, meta)
  values (
    null,
    'info',
    'shopee_sync_http dispatched via pg_cron',
    jsonb_build_object(
      'request_id', to_jsonb(v_request_id),
      'url', 'https://gestao.ambientautilidades.com.br/api/marketplaces/shopee/sync'
    )
  );
exception
  when others then
    raise warning 'Falha em shopee_sync_http: %', sqlerrm;
    insert into public.sync_logs (job_id, level, message, meta)
    values (
      null,
      'error',
      'shopee_sync_http falhou',
      jsonb_build_object('error', sqlerrm)
    );
end;
$$;

-- Remove job existente (se houver) antes de recriar
select cron.unschedule('shopee_orders_sync_5min')
where exists (select 1 from cron.job where jobname = 'shopee_orders_sync_5min');

-- Agenda execução automática a cada 5 minutos
select cron.schedule(
  'shopee_orders_sync_5min',
  '*/5 * * * *',
  $$select public.shopee_sync_http();$$
);
