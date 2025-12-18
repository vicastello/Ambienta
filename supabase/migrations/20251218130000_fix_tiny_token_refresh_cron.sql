-- Migration: Corrigir cron de renovação do token Tiny
-- Problema: O cron anterior não enviava header de Authorization e usava URL errada
-- Solução: Usar função com Authorization header e URL correto

BEGIN;

SET LOCAL search_path = extensions, public;

-- Remove job existente
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'tiny_token_refresh_4h';

-- Cria função que faz a requisição HTTP com Authorization header
CREATE OR REPLACE FUNCTION public.tiny_token_refresh_http()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id bigint;
  v_secret text;
BEGIN
  -- Usa parâmetro de configuração do banco se existir, senão usa o secret hardcoded (seguro pois está no backend)
  v_secret := current_setting('app.cron_secret', true);
  IF v_secret IS NULL OR v_secret = '' OR v_secret = '{{CRON_SECRET}}' THEN
    v_secret := '5919ebd248ec2f12378b7a6efec85e47a510bc296e1b3469c883be9507a533e2';
  END IF;

  SELECT net.http_get(
    url := 'https://gestao.ambientautilidades.com.br/api/admin/cron/refresh-tiny-token',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'User-Agent', 'Supabase-PgCron/1.0'
    ),
    timeout_milliseconds := 30000
  )
  INTO v_request_id;

  INSERT INTO public.sync_logs (job_id, level, message, meta)
  VALUES (
    NULL,
    'info',
    'tiny_token_refresh_http dispatched',
    jsonb_build_object('request_id', to_jsonb(v_request_id))
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Falha em tiny_token_refresh_http: %', SQLERRM;
    INSERT INTO public.sync_logs (job_id, level, message, meta)
    VALUES (
      NULL,
      'error',
      'tiny_token_refresh_http falhou',
      jsonb_build_object('error', SQLERRM)
    );
END;
$$;

-- Agenda renovação a cada 4 horas (00h, 04h, 08h, 12h, 16h, 20h UTC)
SELECT cron.schedule(
  'tiny_token_refresh_4h',
  '0 */4 * * *',
  $$SELECT public.tiny_token_refresh_http();$$
);

-- Log de criação do cron
INSERT INTO sync_logs(level, message, meta)
VALUES (
  'info',
  'Cron tiny_token_refresh_4h recriado com Authorization header',
  json_build_object(
    'schedule', '0 */4 * * *',
    'url', 'https://gestao.ambientautilidades.com.br/api/admin/cron/refresh-tiny-token',
    'description', 'Renovação automática do token Tiny a cada 4 horas com auth'
  )
);

COMMIT;
