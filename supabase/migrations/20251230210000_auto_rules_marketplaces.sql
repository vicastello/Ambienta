-- Migration: Support multiple marketplaces per auto rule

ALTER TABLE auto_rules
    ADD COLUMN IF NOT EXISTS marketplaces TEXT[] NOT NULL
    DEFAULT ARRAY['shopee', 'mercado_livre', 'magalu'];

-- Backfill marketplaces from legacy column
UPDATE auto_rules
SET marketplaces = CASE
    WHEN marketplace IS NULL OR marketplace = 'all' THEN ARRAY['shopee', 'mercado_livre', 'magalu']
    ELSE ARRAY[marketplace]
END;

-- Merge duplicate rules (same conditions/actions/logic) across marketplaces
WITH grouped AS (
    SELECT
        conditions,
        condition_logic,
        actions,
        stop_on_match,
        ARRAY_AGG(id ORDER BY priority DESC, created_at ASC) AS ids,
        MAX(priority) AS max_priority,
        BOOL_OR(enabled) AS any_enabled
    FROM auto_rules
    GROUP BY conditions, condition_logic, actions, stop_on_match
),
merged AS (
    SELECT
        ids[1] AS keep_id,
        ids[2:array_length(ids, 1)] AS other_ids,
        (
            SELECT ARRAY(
                SELECT DISTINCT mp
                FROM auto_rules ar
                JOIN unnest(ar.marketplaces) AS mp ON true
                WHERE ar.id = ANY(ids)
                ORDER BY mp
            )
        ) AS merged_marketplaces,
        max_priority,
        any_enabled
    FROM grouped
    WHERE array_length(ids, 1) > 1
)
UPDATE auto_rules ar
SET marketplaces = merged.merged_marketplaces,
    priority = merged.max_priority,
    enabled = merged.any_enabled
FROM merged
WHERE ar.id = merged.keep_id;

WITH grouped AS (
    SELECT
        conditions,
        condition_logic,
        actions,
        stop_on_match,
        ARRAY_AGG(id ORDER BY priority DESC, created_at ASC) AS ids
    FROM auto_rules
    GROUP BY conditions, condition_logic, actions, stop_on_match
),
merged AS (
    SELECT
        ids[2:array_length(ids, 1)] AS other_ids
    FROM grouped
    WHERE array_length(ids, 1) > 1
)
UPDATE auto_rules ar
SET enabled = false
FROM merged
WHERE ar.id = ANY(merged.other_ids);

-- Replace legacy index and column
DROP INDEX IF EXISTS idx_auto_rules_marketplace;
CREATE INDEX IF NOT EXISTS idx_auto_rules_marketplaces ON auto_rules USING GIN (marketplaces);

ALTER TABLE auto_rules DROP COLUMN IF EXISTS marketplace;

COMMENT ON COLUMN auto_rules.marketplaces IS 'Marketplaces the rule applies to';
