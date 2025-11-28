-- Adds cron configuration knobs for sync pipeline version 2.
BEGIN;

ALTER TABLE public.sync_settings
    ADD COLUMN IF NOT EXISTS cron_dias_recent_orders integer,
    ADD COLUMN IF NOT EXISTS cron_produtos_limit integer,
    ADD COLUMN IF NOT EXISTS cron_enrich_enabled boolean,
    ADD COLUMN IF NOT EXISTS cron_produtos_enabled boolean,
    ADD COLUMN IF NOT EXISTS cron_produtos_enrich_estoque boolean;

-- Pre-fill existing record (if any) with the current defaults so cron keeps same behaviour.
UPDATE public.sync_settings
SET cron_dias_recent_orders = COALESCE(cron_dias_recent_orders, 2),
    cron_produtos_limit = COALESCE(cron_produtos_limit, 30),
    cron_enrich_enabled = COALESCE(cron_enrich_enabled, true),
    cron_produtos_enabled = COALESCE(cron_produtos_enabled, true),
    cron_produtos_enrich_estoque = COALESCE(cron_produtos_enrich_estoque, true)
WHERE id = 1;

COMMIT;
