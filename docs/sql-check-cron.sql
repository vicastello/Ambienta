-- Verificar jobs do pg_cron
select jobid, jobname, schedule
from cron.job
order by jobid desc;

-- Verificar últimos logs da função de cron
select created_at, level, message, meta
from public.sync_logs
where message ilike '%cron_run_tiny_sync%'
order by created_at desc
limit 50;
