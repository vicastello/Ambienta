set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.meli_sync_http()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;


