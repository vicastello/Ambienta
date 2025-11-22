-- Configurar cron jobs no Supabase para garantir que próximos pedidos
-- recebam itens e imagens (via join com tiny_produtos) automaticamente.
-- 
-- Estratégia:
-- 1) Rodar POST em /api/tiny/sync com mode=recent a cada 2 minutos
--    para buscar pedidos recentes e salvar em tiny_orders (inclui chamada
--    de sincronização de itens no fluxo do servidor).
-- 2) Rodar GET em /api/tiny/sync/enrich-background a cada 5 minutos
--    para enriquecer frete/canal e manter dados atualizados.

-- Habilitar pg_cron se necessário
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Desagendar jobs antigos com mesmo nome (se existirem)
DO $$
BEGIN
  PERFORM cron.unschedule('sync-tiny-recent-itens');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('enrich-tiny-background');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- URL pública da aplicação (ajuste se necessário)
-- Observação: usar a URL de produção do Vercel para executar o sync.
-- Mantivemos a mesma base utilizada em 006_update_cron_to_direct_endpoint.sql
-- para consistência.

-- 1) Sincronizar pedidos recentes (POST) a cada 2 minutos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-tiny-recent-itens') THEN
    PERFORM cron.schedule(
      'sync-tiny-recent-itens',
      '*/2 * * * *',
      $$
      SELECT 
        net.http_post(
          url := 'https://gestor-tiny-qxv7irs5g-vihcastello-6133s-projects.vercel.app/api/tiny/sync',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'User-Agent', 'Supabase-PgCron/1.0'
          ),
          body := jsonb_build_object(
            'mode', 'recent',
            'diasRecentes', 2,
            'background', true,
            'timestamp', now()
          )
        )
      $$
    );
  END IF;
END $$;

-- 2) Enriquecer no background (GET) a cada 5 minutos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enrich-tiny-background') THEN
    PERFORM cron.schedule(
      'enrich-tiny-background',
      '*/5 * * * *',
      $$
      SELECT 
        net.http_get(
          url := 'https://gestor-tiny-qxv7irs5g-vihcastello-6133s-projects.vercel.app/api/tiny/sync/enrich-background',
          headers := jsonb_build_object(
            'User-Agent', 'Supabase-PgCron/1.0'
          )
        )
      $$
    );
  END IF;
END $$;

-- Verificar jobs
SELECT jobname, schedule, command FROM cron.job WHERE jobname IN ('sync-tiny-recent-itens', 'enrich-tiny-background');
