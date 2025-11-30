-- Ajusta tiny_produtos_backfill_hourly para rodar a cada 15 minutos (*/15 * * * *).
set search_path = public, extensions;

do $$
declare
  v_jobid int;
begin
  select jobid
  into v_jobid
  from cron.job
  where jobname = 'tiny_produtos_backfill_hourly';

  if v_jobid is not null then
    perform cron.alter_job(v_jobid, '*/15 * * * *');
  end if;
end;
$$;
