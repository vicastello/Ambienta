-- Migration para adicionar cron de ressincronização de status Shopee
-- Este cron roda a cada 6 horas para atualizar status de pedidos pendentes

-- A função de sync já existe, vamos criar um endpoint específico para resync de status
-- e agendar um cron adicional

-- Remove job existente se houver (para recriar com novos parâmetros)
select cron.unschedule('shopee_status_resync_6h')
where exists (
  select 1 from cron.job where jobname = 'shopee_status_resync_6h'
);

-- Cria função para resync de status (chama mesmo endpoint com parâmetro de resync)
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
      'statusResyncOnly', true  -- Flag para indicar que é apenas resync de status
    ),
    timeout_milliseconds := 300000 -- 5 minutos timeout (90 dias pode demorar)
  )
  into v_request_id;

  raise notice 'shopee_status_resync_http dispatched, request_id=%', v_request_id;
exception
  when others then
    raise warning 'Falha em shopee_status_resync_http: %', sqlerrm;
end;
$$;

-- Agenda cron para rodar a cada 6 horas (00:00, 06:00, 12:00, 18:00 UTC)
select cron.schedule(
  'shopee_status_resync_6h',
  '0 0,6,12,18 * * *',  -- A cada 6 horas
  'select public.shopee_status_resync_http()'
);

comment on function public.shopee_status_resync_http() is 
  'Dispara resync de status dos pedidos Shopee dos últimos 90 dias via HTTP POST';
