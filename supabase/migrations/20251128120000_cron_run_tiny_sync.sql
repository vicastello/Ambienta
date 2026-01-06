-- Habilita extensões necessárias para chamadas HTTP e agendamento
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

set search_path = public, extensions;
set check_function_bodies = off;

-- Função chamada pelo pg_cron para acionar o backend Next.js
create or replace function public.cron_run_tiny_sync()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url := 'https://gestao.ambientautilidades.com.br/api/admin/cron/run-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-PgCron/1.0'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  into v_request_id;

  insert into public.sync_logs (job_id, level, message, meta)
  values (
    null,
    'info',
    'cron_run_tiny_sync dispatched via pg_cron',
    jsonb_build_object(
      'request_id', to_jsonb(v_request_id),
      'url', 'https://gestao.ambientautilidades.com.br/api/admin/cron/run-sync'
    )
  );
exception
  when others then
    raise warning 'Falha em cron_run_tiny_sync: %', sqlerrm;
    insert into public.sync_logs (job_id, level, message, meta)
    values (
      null,
      'error',
      'cron_run_tiny_sync falhou',
      jsonb_build_object('error', sqlerrm)
    );
end;
$$;
-- Remove job existente (se houver) antes de recriar
select cron.unschedule('tiny_sync_every_15min')
where exists (select 1 from cron.job where jobname = 'tiny_sync_every_15min');

-- Agenda execução automática a cada 15 minutos
select cron.schedule(
  'tiny_sync_every_15min',
  '*/15 * * * *',
  $$select public.cron_run_tiny_sync();$$
);
