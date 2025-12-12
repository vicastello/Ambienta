-- Ajusta jobs de cron dos marketplaces (Mercado Livre, Shopee e Magalu)
-- Padrão: usar domínio público https://gestao.ambientautilidades.com.br
-- e registrar logs em sync_logs para observabilidade.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

set search_path = public, extensions;
set check_function_bodies = off;

-- =====================================================
-- Mercado Livre: função http + cron a cada 15 minutos
-- =====================================================
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

select cron.unschedule('meli_orders_sync_15min')
where exists (select 1 from cron.job where jobname = 'meli_orders_sync_15min');

select cron.schedule(
  'meli_orders_sync_15min',
  '*/15 * * * *',
  $$select public.meli_sync_http();$$
);

-- =====================================================
-- Shopee: função http + cron a cada 5 minutos
-- =====================================================
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
    body := jsonb_build_object('periodDays', 3),
    timeout_milliseconds := 120000
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

select cron.unschedule('shopee_orders_sync_5min')
where exists (select 1 from cron.job where jobname = 'shopee_orders_sync_5min');

select cron.schedule(
  'shopee_orders_sync_5min',
  '*/5 * * * *',
  $$select public.shopee_sync_http();$$
);

-- Shopee: cron de ressincronização de status a cada 6 horas
create or replace function public.shopee_status_resync_http()
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
    body := jsonb_build_object(
      'periodDays', 90,
      'statusResyncOnly', true
    ),
    timeout_milliseconds := 300000
  )
  into v_request_id;

  insert into public.sync_logs (job_id, level, message, meta)
  values (
    null,
    'info',
    'shopee_status_resync_http dispatched via pg_cron',
    jsonb_build_object(
      'request_id', to_jsonb(v_request_id),
      'url', 'https://gestao.ambientautilidades.com.br/api/marketplaces/shopee/sync'
    )
  );
exception
  when others then
    raise warning 'Falha em shopee_status_resync_http: %', sqlerrm;
    insert into public.sync_logs (job_id, level, message, meta)
    values (
      null,
      'error',
      'shopee_status_resync_http falhou',
      jsonb_build_object('error', sqlerrm)
    );
end;
$$;

select cron.unschedule('shopee_status_resync_6h')
where exists (select 1 from cron.job where jobname = 'shopee_status_resync_6h');

select cron.schedule(
  'shopee_status_resync_6h',
  '0 0,6,12,18 * * *',
  $$select public.shopee_status_resync_http();$$
);

-- =====================================================
-- Magalu: funções http + cron (15min e 6h)
-- =====================================================
create or replace function public.magalu_sync_http()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url := 'https://gestao.ambientautilidades.com.br/api/marketplaces/magalu/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-PgCron/1.0'
    ),
    body := jsonb_build_object('periodDays', 3),
    timeout_milliseconds := 120000
  )
  into v_request_id;

  insert into public.sync_logs (job_id, level, message, meta)
  values (
    null,
    'info',
    'magalu_sync_http dispatched via pg_cron',
    jsonb_build_object(
      'request_id', to_jsonb(v_request_id),
      'url', 'https://gestao.ambientautilidades.com.br/api/marketplaces/magalu/sync'
    )
  );
exception
  when others then
    raise warning 'Falha em magalu_sync_http: %', sqlerrm;
    insert into public.sync_logs (job_id, level, message, meta)
    values (
      null,
      'error',
      'magalu_sync_http falhou',
      jsonb_build_object('error', sqlerrm)
    );
end;
$$;

create or replace function public.magalu_status_resync_http()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url := 'https://gestao.ambientautilidades.com.br/api/marketplaces/magalu/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-PgCron/1.0'
    ),
    body := jsonb_build_object(
      'periodDays', 90,
      'statusResyncOnly', true
    ),
    timeout_milliseconds := 300000
  )
  into v_request_id;

  insert into public.sync_logs (job_id, level, message, meta)
  values (
    null,
    'info',
    'magalu_status_resync_http dispatched via pg_cron',
    jsonb_build_object(
      'request_id', to_jsonb(v_request_id),
      'url', 'https://gestao.ambientautilidades.com.br/api/marketplaces/magalu/sync'
    )
  );
exception
  when others then
    raise warning 'Falha em magalu_status_resync_http: %', sqlerrm;
    insert into public.sync_logs (job_id, level, message, meta)
    values (
      null,
      'error',
      'magalu_status_resync_http falhou',
      jsonb_build_object('error', sqlerrm)
    );
end;
$$;

select cron.unschedule('magalu_sync_15min')
where exists (select 1 from cron.job where jobname = 'magalu_sync_15min');

select cron.schedule(
  'magalu_sync_15min',
  '*/15 * * * *',
  $$select public.magalu_sync_http();$$
);

select cron.unschedule('magalu_status_resync_6h')
where exists (select 1 from cron.job where jobname = 'magalu_status_resync_6h');

select cron.schedule(
  'magalu_status_resync_6h',
  '0 */6 * * *',
  $$select public.magalu_status_resync_http();$$
);
