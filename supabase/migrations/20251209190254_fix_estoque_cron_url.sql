-- Fix estoque round robin cron URL to use correct Vercel domain
-- Updates tiny_estoque_round_robin_http function to use gestor-tiny.vercel.app

set search_path = public, extensions;
set check_function_bodies = off;

create or replace function public.tiny_estoque_round_robin_http()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
  v_secret text;
  v_body jsonb := jsonb_build_object('batchSize', 200);
begin
  -- Usa parametro de configuracao do banco se existir, senao placeholder de env
  v_secret := current_setting('app.cron_secret', true);
  if v_secret is null or v_secret = '' then
    v_secret := '{{CRON_SECRET}}';
  end if;

  select net.http_post(
    url := 'https://gestor-tiny.vercel.app/api/tiny/cron/estoque-round-robin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret,
      'User-Agent', 'Supabase-PgCron/1.0'
    ),
    body := v_body,
    timeout_milliseconds := 120000
  )
  into v_request_id;

  insert into public.sync_logs (job_id, level, message, meta)
  values (
    null,
    'info',
    'tiny_estoque_round_robin_http dispatched',
    jsonb_build_object('request_id', to_jsonb(v_request_id), 'body', v_body)
  );
exception
  when others then
    raise warning 'Falha em tiny_estoque_round_robin_http: %', sqlerrm;
    insert into public.sync_logs (job_id, level, message, meta)
    values (
      null,
      'error',
      'tiny_estoque_round_robin_http falhou',
      jsonb_build_object('error', sqlerrm)
    );
end;
$$;
