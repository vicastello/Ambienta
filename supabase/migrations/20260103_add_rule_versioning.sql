-- Migration: Add versioning support to auto_rules
-- Date: 2026-01-02

-- Add version and status columns for draft/published workflow
ALTER TABLE auto_rules 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

ALTER TABLE auto_rules 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived'));

-- Add published_at timestamp
ALTER TABLE auto_rules 
ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE;

-- Add draft_data to store pending changes while rule is published
-- This allows editing a published rule without affecting production until explicitly published
ALTER TABLE auto_rules 
ADD COLUMN IF NOT EXISTS draft_data JSONB;

-- Create index for faster status filtering
CREATE INDEX IF NOT EXISTS idx_auto_rules_status ON auto_rules(status);

-- Set published_at for existing rules
UPDATE auto_rules 
SET published_at = created_at 
WHERE published_at IS NULL AND status = 'published';

-- Add comment explaining the workflow
COMMENT ON COLUMN auto_rules.version IS 'Version number, incremented on each publish';
COMMENT ON COLUMN auto_rules.status IS 'Rule status: draft (not active), published (active), archived (disabled but kept)';
COMMENT ON COLUMN auto_rules.draft_data IS 'Pending changes for a published rule, applied on next publish';
COMMENT ON COLUMN auto_rules.published_at IS 'When the current version was published';

-- Create function to publish a draft or apply draft_data
CREATE OR REPLACE FUNCTION publish_rule(
    p_rule_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_rule RECORD;
    v_result JSONB;
BEGIN
    -- Get the rule
    SELECT * INTO v_rule FROM auto_rules WHERE id = p_rule_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Rule not found');
    END IF;
    
    -- If rule has draft_data, apply it
    IF v_rule.draft_data IS NOT NULL THEN
        UPDATE auto_rules SET
            name = COALESCE((draft_data->>'name')::TEXT, name),
            description = COALESCE((draft_data->>'description')::TEXT, description),
            conditions = COALESCE((draft_data->'conditions')::JSONB, conditions),
            condition_logic = COALESCE((draft_data->>'condition_logic')::TEXT, condition_logic),
            actions = COALESCE((draft_data->'actions')::JSONB, actions),
            priority = COALESCE((draft_data->>'priority')::INTEGER, priority),
            stop_on_match = COALESCE((draft_data->>'stop_on_match')::BOOLEAN, stop_on_match),
            marketplaces = COALESCE(
                ARRAY(SELECT jsonb_array_elements_text(draft_data->'marketplaces')),
                marketplaces
            ),
            draft_data = NULL,
            version = version + 1,
            status = 'published',
            published_at = NOW(),
            updated_at = NOW()
        WHERE id = p_rule_id;
        
        v_result := jsonb_build_object(
            'success', true,
            'action', 'published_draft_changes',
            'new_version', v_rule.version + 1
        );
    -- If rule is in draft status, publish it
    ELSIF v_rule.status = 'draft' THEN
        UPDATE auto_rules SET
            status = 'published',
            published_at = NOW(),
            updated_at = NOW()
        WHERE id = p_rule_id;
        
        v_result := jsonb_build_object(
            'success', true,
            'action', 'published_draft_rule',
            'version', v_rule.version
        );
    ELSE
        v_result := jsonb_build_object(
            'success', false,
            'error', 'Rule is already published with no pending changes'
        );
    END IF;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to save changes to draft_data without publishing
CREATE OR REPLACE FUNCTION save_rule_draft(
    p_rule_id UUID,
    p_draft_data JSONB
) RETURNS JSONB AS $$
BEGIN
    UPDATE auto_rules SET
        draft_data = p_draft_data,
        updated_at = NOW()
    WHERE id = p_rule_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Rule not found');
    END IF;
    
    RETURN jsonb_build_object('success', true, 'has_draft', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION publish_rule(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION save_rule_draft(UUID, JSONB) TO authenticated;
