-- Atualiza cron_run_produtos_backfill para enviar cursor dedicado (catalog_backfill).
set search_path = public, extensions;
set check_function_bodies = off;

create or replace function public.cron_run_produtos_backfill()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url := 'https://gestor-tiny.vercel.app/api/admin/sync/produtos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-PgCron/1.0'
    ),
    body := jsonb_build_object(
      'mode', 'backfill',
      'modeLabel', 'backfill_cron',
      'cursorKey', 'catalog_backfill',
      'limit', 10,
      'workers', 1,
      'estoqueOnly', false,
      'enrichEstoque', false
    ),
    timeout_milliseconds := 55000
  )
  into v_request_id;

  insert into public.sync_logs (job_id, level, message, meta)
  values (
    null,
    'info',
    'cron_run_produtos_backfill dispatched via pg_cron',
    jsonb_build_object(
      'request_id', to_jsonb(v_request_id),
      'url', 'https://gestor-tiny.vercel.app/api/admin/sync/produtos'
    )
  );
exception
  when others then
    raise warning 'Falha em cron_run_produtos_backfill: %', sqlerrm;
    insert into public.sync_logs (job_id, level, message, meta)
    values (
      null,
      'error',
      'cron_run_produtos_backfill falhou',
      jsonb_build_object('error', sqlerrm)
    );
end;
$$;
