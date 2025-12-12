-- Cron job para vincular automaticamente pedidos pendentes a cada hora
-- Processa pedidos dos últimos 7 dias que ainda não têm vínculo

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

set search_path = public, extensions;
set check_function_bodies = off;

-- Função para chamar a API de auto-linking
create or replace function public.auto_link_pending_orders_http()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url := 'https://gestao.ambientautilidades.com.br/api/sync/auto-link-pending',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-PgCron/1.0'
    ),
    body := jsonb_build_object('daysBack', 7),
    timeout_milliseconds := 120000
  )
  into v_request_id;

  insert into public.sync_logs (job_id, level, message, meta)
  values (
    null,
    'info',
    'auto_link_pending_orders_http dispatched via pg_cron',
    jsonb_build_object(
      'request_id', to_jsonb(v_request_id),
      'url', 'https://gestao.ambientautilidades.com.br/api/sync/auto-link-pending',
      'daysBack', 7
    )
  );
exception
  when others then
    raise warning 'Falha em auto_link_pending_orders_http: %', sqlerrm;
    insert into public.sync_logs (job_id, level, message, meta)
    values (
      null,
      'error',
      'auto_link_pending_orders_http falhou',
      jsonb_build_object('error', sqlerrm)
    );
end;
$$;

-- Remove job anterior se existir
select cron.unschedule('auto_link_pending_orders_hourly')
where exists (select 1 from cron.job where jobname = 'auto_link_pending_orders_hourly');

-- Agenda para rodar a cada hora (no minuto 15)
select cron.schedule(
  'auto_link_pending_orders_hourly',
  '15 * * * *',
  $$select public.auto_link_pending_orders_http();$$
);

comment on function public.auto_link_pending_orders_http() is 'Vincula automaticamente pedidos pendentes a cada hora via pg_cron';
