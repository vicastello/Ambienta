-- Migration: Migrar cron de fixação de itens de pedido do Github Actions para Supabase Cron
-- Agenda execução a cada 15 minutos

BEGIN;

SET LOCAL search_path = extensions, public;

-- Remove job existente se houver (para evitar duplicidade)
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'fix_pedido_itens_15min';

-- Agenda execução a cada 15 minutos
SELECT cron.schedule(
  'fix_pedido_itens_15min',
  '*/15 * * * *',
  $$SELECT
    net.http_post(
      url := 'https://gestor-tiny.vercel.app/api/admin/cron/fix-pedido-itens',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', '5919ebd248ec2f12378b7a6efec85e47a510bc296e1b3469c883be9507a533e2',
        'User-Agent', 'Supabase-PgCron/1.0'
      ),
      body := '{"dias": 3, "limit": 400, "force": true}'::jsonb,
      timeout_milliseconds := 60000
    );$$
);

-- Log de criação do cron
INSERT INTO sync_logs(level, message, meta)
VALUES (
  'info',
  'Cron fix_pedido_itens_15min criado',
  json_build_object(
    'schedule', '*/15 * * * *',
    'description', 'Correção automática de itens de pedido faltantes',
    'migrated_from', 'Github Actions'
  )
);

COMMIT;
