-- Cron job para sincronização automática do Magalu
-- Executa a cada 15 minutos buscando pedidos dos últimos 3 dias

-- Remover job existente se houver
SELECT cron.unschedule('magalu_sync_15min')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'magalu_sync_15min'
);

-- Criar job de sincronização incremental (a cada 15 min)
SELECT cron.schedule(
  'magalu_sync_15min',
  '*/15 * * * *', -- A cada 15 minutos
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.base_url', true) || '/api/marketplaces/magalu/sync',
    body := '{"periodDays": 3}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Job de ressincronização de status (a cada 6 horas)
SELECT cron.unschedule('magalu_status_resync_6h')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'magalu_status_resync_6h'
);

SELECT cron.schedule(
  'magalu_status_resync_6h',
  '0 */6 * * *', -- A cada 6 horas
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.base_url', true) || '/api/marketplaces/magalu/sync',
    body := '{"statusResyncOnly": true, "periodDays": 90}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- Comentário removido pois requer ownership da tabela cron.job
