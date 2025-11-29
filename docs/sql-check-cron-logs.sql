select
  created_at,
  level,
  message,
  meta
from public.sync_logs
where message like 'cron_run_tiny_sync%'
order by created_at desc
limit 20;
