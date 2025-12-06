-- Habilita extensões necessárias
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

set search_path = public, extensions;
set check_function_bodies = off;

-- Adiciona coluna de settings para armazenar cursor do round robin (jsonb)
alter table public.sync_settings
  add column if not exists settings jsonb default '{}'::jsonb;

-- Garante linha id=1 com settings inicial
insert into public.sync_settings (id, settings)
values (1, '{}'::jsonb)
on conflict (id) do update set settings = coalesce(public.sync_settings.settings, '{}'::jsonb);

-- Função para acionar a API de round robin de estoque via pg_cron
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
  -- Usa parâmetro de configuração do banco se existir, senão placeholder de env
  v_secret := current_setting('app.cron_secret', true);
  if v_secret is null or v_secret = '' then
    v_secret := '{{CRON_SECRET}}';
  end if;

  select net.http_post(
    url := 'https://gestao.ambientautilidades.com.br/api/tiny/cron/estoque-round-robin',
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

-- Remove job existente (se houver) antes de recriar
select cron.unschedule('tiny_estoque_round_robin_5min')
where exists (select 1 from cron.job where jobname = 'tiny_estoque_round_robin_5min');

-- Agenda execução a cada 5 minutos
select cron.schedule(
  'tiny_estoque_round_robin_5min',
  '*/5 * * * *',
  $$select public.tiny_estoque_round_robin_http();$$
);
