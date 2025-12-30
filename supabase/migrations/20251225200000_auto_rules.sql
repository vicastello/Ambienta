-- Migration: Create auto_rules table
-- This is the new professional rules engine table

-- Create the new table
CREATE TABLE IF NOT EXISTS auto_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    marketplace VARCHAR(50) NOT NULL DEFAULT 'all',
    conditions JSONB NOT NULL DEFAULT '[]',
    condition_logic VARCHAR(3) NOT NULL DEFAULT 'AND',
    actions JSONB NOT NULL DEFAULT '[]',
    priority INTEGER NOT NULL DEFAULT 50 CHECK (priority >= 1 AND priority <= 100),
    enabled BOOLEAN NOT NULL DEFAULT true,
    stop_on_match BOOLEAN NOT NULL DEFAULT false,
    is_system_rule BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_auto_rules_marketplace ON auto_rules(marketplace);
CREATE INDEX IF NOT EXISTS idx_auto_rules_enabled ON auto_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_auto_rules_priority ON auto_rules(priority DESC);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_auto_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_rules_updated_at ON auto_rules;
CREATE TRIGGER trigger_auto_rules_updated_at
    BEFORE UPDATE ON auto_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_auto_rules_updated_at();

-- Migrate existing rules from payment_auto_link_rules (if any)
INSERT INTO auto_rules (name, marketplace, conditions, actions, priority, enabled)
SELECT 
    COALESCE(
        SUBSTRING(transaction_type_pattern FROM 3 FOR 30),  -- Extract readable part
        'Regra migrada'
    ) AS name,
    marketplace,
    jsonb_build_array(
        jsonb_build_object(
            'id', 'cond_' || SUBSTRING(md5(random()::text), 1, 8),
            'field', 'full_text',
            'operator', 'regex',
            'value', transaction_type_pattern
        )
    ) AS conditions,
    jsonb_build_array(
        jsonb_build_object(
            'type', 'add_tags',
            'tags', COALESCE(to_jsonb(tags), '[]'::jsonb)
        )
    ) AS actions,
    COALESCE(priority, 50) AS priority,
    true AS enabled
FROM payment_auto_link_rules
WHERE NOT EXISTS (
    SELECT 1 FROM auto_rules WHERE auto_rules.name = 'Regra migrada'
)
ON CONFLICT DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE auto_rules IS 'Professional auto-rules engine for automatic payment categorization';
COMMENT ON COLUMN auto_rules.conditions IS 'JSON array of conditions: [{field, operator, value}]';
COMMENT ON COLUMN auto_rules.actions IS 'JSON array of actions: [{type, tags?, category?}]';
COMMENT ON COLUMN auto_rules.condition_logic IS 'AND = all conditions must match, OR = any condition can match';
COMMENT ON COLUMN auto_rules.stop_on_match IS 'If true, stop processing more rules after this one matches';
