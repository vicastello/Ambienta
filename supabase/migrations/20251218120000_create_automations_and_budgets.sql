-- Migration: Create automation rules and budget tables

-- Automation rules table
CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    
    -- Trigger conditions
    trigger_event TEXT NOT NULL CHECK (trigger_event IN (
        'entry_created', -- When new entry is created
        'entry_updated', -- When entry is updated
        'status_changed', -- When entry status changes
        'reconciliation' -- During bank reconciliation
    )),
    
    -- Conditions (JSON array of conditions)
    -- Example: [{"field": "description", "operator": "contains", "value": "Shopee"}]
    conditions JSONB NOT NULL DEFAULT '[]',
    match_type TEXT NOT NULL DEFAULT 'all' CHECK (match_type IN ('all', 'any')),
    
    -- Actions (JSON array of actions)
    -- Example: [{"action": "set_category", "value": "Marketplace"}]
    actions JSONB NOT NULL DEFAULT '[]',
    
    -- Configuration
    is_enabled BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- Higher priority runs first
    apply_to_existing BOOLEAN DEFAULT false,
    
    -- Stats
    times_triggered INTEGER DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Budgets table
CREATE TABLE IF NOT EXISTS financial_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Budget info
    name TEXT NOT NULL,
    description TEXT,
    
    -- Period
    period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Type
    budget_type TEXT NOT NULL CHECK (budget_type IN ('category', 'cost_center', 'total', 'entity')),
    target_value TEXT, -- Category name, cost center, or entity name
    
    -- Amounts
    planned_amount NUMERIC(12, 2) NOT NULL,
    
    -- Alerts
    alert_threshold INTEGER DEFAULT 80, -- Alert at X% of budget
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Budget entries for tracking spending against budget
CREATE TABLE IF NOT EXISTS budget_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES financial_budgets(id) ON DELETE CASCADE,
    
    -- Period snapshot
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Amounts
    planned_amount NUMERIC(12, 2) NOT NULL,
    actual_amount NUMERIC(12, 2) DEFAULT 0,
    variance NUMERIC(12, 2) DEFAULT 0,
    variance_percent NUMERIC(5, 2) DEFAULT 0,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track', 'warning', 'over_budget', 'under_budget')),
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled ON automation_rules(is_enabled, priority DESC);
CREATE INDEX IF NOT EXISTS idx_financial_budgets_active ON financial_budgets(is_active, period_type);
CREATE INDEX IF NOT EXISTS idx_budget_tracking_budget ON budget_tracking(budget_id, period_start);

-- Insert some default automation rules
INSERT INTO automation_rules (name, description, trigger_event, conditions, actions, priority) VALUES
(
    'Shopee - Marketplace',
    'Categoriza entradas Shopee como Marketplace',
    'entry_created',
    '[{"field": "description", "operator": "icontains", "value": "shopee"}]'::jsonb,
    '[{"action": "set_category", "value": "Marketplace"}, {"action": "add_tag", "value": "shopee"}]'::jsonb,
    10
),
(
    'Mercado Livre - Marketplace',
    'Categoriza entradas ML como Marketplace',
    'entry_created',
    '[{"field": "description", "operator": "icontains", "value": "mercado livre"}]'::jsonb,
    '[{"action": "set_category", "value": "Marketplace"}, {"action": "add_tag", "value": "mercadolivre"}]'::jsonb,
    10
),
(
    'PIX - Pagamento',
    'Adiciona tag PIX para transferências',
    'reconciliation',
    '[{"field": "description", "operator": "icontains", "value": "pix"}]'::jsonb,
    '[{"action": "add_tag", "value": "pix"}]'::jsonb,
    5
)
ON CONFLICT DO NOTHING;
