-- Remove qualquer job do pg_cron que invoque sync_produtos_from_tiny
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    BEGIN
      DELETE FROM cron.job
      WHERE command ILIKE '%sync_produtos_from_tiny%';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping cron.job cleanup due to permissions';
    END;
  END IF;
END $$;

-- Drop da função legacy de sync de produtos
DROP FUNCTION IF EXISTS public.sync_produtos_from_tiny();
