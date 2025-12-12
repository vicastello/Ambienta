-- Agenda auto-linking diário para todos os marketplaces (Magalu, Shopee, Mercado Livre)
-- Usa a API interna /api/reports/auto-link com daysBack padrão (90 dias).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

set search_path = public, extensions;
set check_function_bodies = off;

-- Função http para disparar o auto-link
create or replace function public.marketplace_auto_link_http()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url := 'https://gestao.ambientautilidades.com.br/api/reports/auto-link',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-PgCron/1.0'
    ),
    body := jsonb_build_object('daysBack', 120),
    timeout_milliseconds := 300000
  )
  into v_request_id;

  insert into public.sync_logs (job_id, level, message, meta)
  values (
    null,
    'info',
    'marketplace_auto_link_http dispatched via pg_cron',
    jsonb_build_object(
      'request_id', to_jsonb(v_request_id),
      'url', 'https://gestao.ambientautilidades.com.br/api/reports/auto-link',
      'daysBack', 120
    )
  );
exception
  when others then
    raise warning 'Falha em marketplace_auto_link_http: %', sqlerrm;
    insert into public.sync_logs (job_id, level, message, meta)
    values (
      null,
      'error',
      'marketplace_auto_link_http falhou',
      jsonb_build_object('error', sqlerrm)
    );
end;
$$;

-- Agenda diária às 02:00 UTC (23:00 BRT)
select cron.unschedule('marketplace_auto_link_daily')
where exists (select 1 from cron.job where jobname = 'marketplace_auto_link_daily');

select cron.schedule(
  'marketplace_auto_link_daily',
  '0 2 * * *',
  $$select public.marketplace_auto_link_http();$$
);

comment on function public.marketplace_auto_link_http() is 'Chama /api/reports/auto-link (todos marketplaces) via pg_cron diariamente';
