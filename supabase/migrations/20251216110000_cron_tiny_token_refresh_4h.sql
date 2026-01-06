-- Migration: Adicionar cron job para renovação automática do token Tiny a cada 4 horas
-- Este cron é um backup para garantir que o token seja renovado mesmo se o cron principal falhar

BEGIN;

SET LOCAL search_path = extensions, public;

-- Remove job existente se houver
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'tiny_token_refresh_4h';

-- Agenda renovação a cada 4 horas
-- Executa em horários alternados ao cron principal de sync (às 00h, 04h, 08h, 12h, 16h, 20h)
SELECT cron.schedule(
  'tiny_token_refresh_4h',
  '0 */4 * * *',  -- A cada 4 horas
  $$SELECT
    net.http_get(
      url := 'https://gestao.ambientautilidades.com.br/api/admin/cron/refresh-tiny-token',
      headers := jsonb_build_object(
        'User-Agent', 'Supabase-PgCron/1.0'
      ),
      timeout_milliseconds := 30000
    );$$
);

-- Log de criação do cron
INSERT INTO sync_logs(level, message, meta)
VALUES (
  'info',
  'Cron tiny_token_refresh_4h criado',
  json_build_object(
    'schedule', '0 */4 * * *',
    'description', 'Renovação automática do token Tiny a cada 4 horas'
  )
);

COMMIT;
