-- Reaplica a função garantindo que o cron use o retorno bigint do pg_net
set search_path = public, extensions;

create or replace function public.cron_run_tiny_sync()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	v_request_id bigint;
begin
	select net.http_post(
		url := 'https://gestor-tiny.vercel.app/api/admin/cron/run-sync',
		headers := jsonb_build_object(
			'Content-Type', 'application/json',
			'User-Agent', 'Supabase-PgCron/1.0'
		),
		body := '{}'::jsonb,
		timeout_milliseconds := 55000
	)
	into v_request_id;

	insert into public.sync_logs (job_id, level, message, meta)
	values (
		null,
		'info',
		'cron_run_tiny_sync dispatched via pg_cron',
		jsonb_build_object(
			'request_id', to_jsonb(v_request_id),
			'url', 'https://gestor-tiny.vercel.app/api/admin/cron/run-sync'
		)
	);
exception
	when others then
		raise warning 'Falha em cron_run_tiny_sync: %', sqlerrm;
		insert into public.sync_logs (job_id, level, message, meta)
		values (
			null,
			'error',
			'cron_run_tiny_sync falhou',
			jsonb_build_object('error', sqlerrm)
		);
end;
$$;
