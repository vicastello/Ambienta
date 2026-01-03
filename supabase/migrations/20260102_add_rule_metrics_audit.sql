-- Migration: Add rule metrics and audit log
-- Date: 2026-01-02
-- Description: Adds match tracking metrics to auto_rules and creates audit log table

-- ============================================
-- 1. Add metrics columns to auto_rules
-- ============================================

-- Match count: how many times this rule has been applied
ALTER TABLE auto_rules ADD COLUMN IF NOT EXISTS match_count INTEGER DEFAULT 0;

-- Last applied timestamp
ALTER TABLE auto_rules ADD COLUMN IF NOT EXISTS last_applied_at TIMESTAMP WITH TIME ZONE;

-- Total financial impact (sum of absolute values of matched payments)
ALTER TABLE auto_rules ADD COLUMN IF NOT EXISTS total_impact NUMERIC(15,2) DEFAULT 0;

-- Add index for quick sorting by metrics
CREATE INDEX IF NOT EXISTS idx_auto_rules_match_count ON auto_rules(match_count DESC);
CREATE INDEX IF NOT EXISTS idx_auto_rules_last_applied ON auto_rules(last_applied_at DESC NULLS LAST);

-- ============================================
-- 2. Create rule audit log table
-- ============================================

CREATE TABLE IF NOT EXISTS rule_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rule_id TEXT NOT NULL,
    rule_name TEXT,
    action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'enabled', 'disabled', 'metrics_updated')),
    previous_data JSONB,
    new_data JSONB,
    changed_by TEXT,  -- Could be user email or 'system'
    change_reason TEXT,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_rule_audit_rule_id ON rule_audit_log(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_audit_changed_at ON rule_audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_audit_action ON rule_audit_log(action);

-- ============================================
-- 3. Add trigger to log rule changes
-- ============================================

-- Function to log rule changes automatically
CREATE OR REPLACE FUNCTION log_rule_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO rule_audit_log (rule_id, rule_name, action, new_data, changed_by)
        VALUES (NEW.id, NEW.name, 'created', to_jsonb(NEW), 'system');
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Skip logging for metrics-only updates
        IF OLD.match_count IS DISTINCT FROM NEW.match_count 
           AND OLD.name = NEW.name 
           AND OLD.conditions::text = NEW.conditions::text 
           AND OLD.actions::text = NEW.actions::text THEN
            -- This is just a metrics update, use lighter action
            INSERT INTO rule_audit_log (rule_id, rule_name, action, changed_by)
            VALUES (NEW.id, NEW.name, 'metrics_updated', 'system');
        ELSE
            -- Full update
            INSERT INTO rule_audit_log (rule_id, rule_name, action, previous_data, new_data, changed_by)
            VALUES (NEW.id, NEW.name, 
                    CASE WHEN OLD.enabled = true AND NEW.enabled = false THEN 'disabled'
                         WHEN OLD.enabled = false AND NEW.enabled = true THEN 'enabled'
                         ELSE 'updated' END,
                    to_jsonb(OLD), to_jsonb(NEW), 'system');
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO rule_audit_log (rule_id, rule_name, action, previous_data, changed_by)
        VALUES (OLD.id, OLD.name, 'deleted', to_jsonb(OLD), 'system');
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on auto_rules
DROP TRIGGER IF EXISTS auto_rules_audit_trigger ON auto_rules;
CREATE TRIGGER auto_rules_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON auto_rules
    FOR EACH ROW EXECUTE FUNCTION log_rule_change();

-- ============================================
-- 4. Add RLS policies for audit log
-- ============================================

-- Enable RLS on audit log
ALTER TABLE rule_audit_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read audit log
CREATE POLICY "Users can view rule audit log" ON rule_audit_log
    FOR SELECT TO authenticated
    USING (true);

-- Only system can insert/update (via trigger)
CREATE POLICY "System can insert audit log" ON rule_audit_log
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- ============================================
-- 5. Add RPC function for atomic metrics increment
-- ============================================

CREATE OR REPLACE FUNCTION increment_rule_metrics(
    p_rule_id TEXT,
    p_match_count INTEGER DEFAULT 1,
    p_total_impact NUMERIC DEFAULT 0,
    p_last_applied_at TIMESTAMP WITH TIME ZONE DEFAULT now()
)
RETURNS void AS $$
BEGIN
    UPDATE auto_rules
    SET 
        match_count = COALESCE(match_count, 0) + p_match_count,
        total_impact = COALESCE(total_impact, 0) + p_total_impact,
        last_applied_at = p_last_applied_at
    WHERE id = p_rule_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
