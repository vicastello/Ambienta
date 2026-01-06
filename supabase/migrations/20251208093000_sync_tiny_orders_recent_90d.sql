-- Agenda sync diário dos últimos 90 dias para pedidos Tiny (forçando reprocessamento de pedidos já existentes)
-- Janelas: usa modo orders com force=1 para evitar perder enrichments em pedidos antigos

BEGIN;

set local search_path = extensions, public;

-- evita duplicidade caso já exista
select cron.unschedule(jobname)
from cron.job
where jobname = 'tiny_orders_recent_90d';

select
  cron.schedule(
    'tiny_orders_recent_90d',
    '30 8 * * *',
    $$select
      net.http_post(
        url := 'https://gestao.ambientautilidades.com.br/api/tiny/sync?mode=orders&daysBack=90&force=1',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := '{}'::jsonb,
        timeout_milliseconds := 300000
      );$$
  );

insert into sync_logs(level, message, meta)
values (
  'info',
  'cron tiny_orders_recent_90d agendado',
  json_build_object('schedule', '30 8 * * *', 'mode', 'orders', 'daysBack', 90, 'force', true)
);

COMMIT;
