-- Migration: Create recurring entries schedules table
-- This table stores recurring entry templates that will auto-generate cash flow entries

-- Create recurring_entries table
CREATE TABLE IF NOT EXISTS recurring_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Template data (same as cash_flow_entries)
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount NUMERIC(12, 2) NOT NULL,
    description TEXT NOT NULL,
    category TEXT,
    category_id UUID REFERENCES financial_categories(id),
    subcategory TEXT,
    entity_name TEXT,
    entity_type TEXT CHECK (entity_type IN ('client', 'supplier', 'employee', 'bank', 'government', 'other')),
    cost_center TEXT,
    tags TEXT[] DEFAULT '{}',
    notes TEXT,
    
    -- Schedule configuration
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
    day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 31),
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday
    
    -- Date range
    start_date DATE NOT NULL,
    end_date DATE, -- NULL means no end
    
    -- Tracking
    is_active BOOLEAN DEFAULT true,
    last_generated_date DATE,
    next_due_date DATE,
    total_generated INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active schedules
CREATE INDEX IF NOT EXISTS idx_recurring_entries_active ON recurring_entries(is_active, next_due_date);

-- Add parent_recurring_id to cash_flow_entries to track generated entries
ALTER TABLE cash_flow_entries 
    ADD COLUMN IF NOT EXISTS parent_recurring_id UUID REFERENCES recurring_entries(id),
    ADD COLUMN IF NOT EXISTS is_generated BOOLEAN DEFAULT false;

-- Index for finding generated entries
CREATE INDEX IF NOT EXISTS idx_cash_flow_entries_recurring ON cash_flow_entries(parent_recurring_id) WHERE parent_recurring_id IS NOT NULL;

-- Create installments table for parcelamentos
CREATE TABLE IF NOT EXISTS installment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Base entry info
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    total_amount NUMERIC(12, 2) NOT NULL,
    description TEXT NOT NULL,
    category TEXT,
    category_id UUID REFERENCES financial_categories(id),
    entity_name TEXT,
    entity_type TEXT CHECK (entity_type IN ('client', 'supplier', 'employee', 'bank', 'government', 'other')),
    
    -- Installment configuration
    total_installments INTEGER NOT NULL CHECK (total_installments >= 2),
    installment_amount NUMERIC(12, 2) NOT NULL,
    first_due_date DATE NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
    
    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    paid_installments INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add installment reference to cash_flow_entries
ALTER TABLE cash_flow_entries 
    ADD COLUMN IF NOT EXISTS installment_plan_id UUID REFERENCES installment_plans(id),
    ADD COLUMN IF NOT EXISTS installment_number INTEGER;

-- Index for installment entries
CREATE INDEX IF NOT EXISTS idx_cash_flow_entries_installment ON cash_flow_entries(installment_plan_id) WHERE installment_plan_id IS NOT NULL;
