-- Migration: Create cash_flow_entries table for manual and synced financial entries
-- Date: 2024-12-17

-- Table for cash flow entries (manual and synced)
CREATE TABLE IF NOT EXISTS public.cash_flow_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Entry type and amount
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  
  -- Description and categorization
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  subcategory VARCHAR(50),
  
  -- Dates
  due_date DATE NOT NULL,
  paid_date DATE,
  competence_date DATE, -- For DRE alignment
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'overdue', 'cancelled')),
  
  -- Source tracking (for sync and linking)
  source VARCHAR(50) DEFAULT 'manual', -- 'manual', 'tiny_contas', 'purchase_order', 'dre', 'recurrence'
  source_id VARCHAR(100), -- External ID if applicable
  
  -- Recurrence support
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule JSONB, -- { interval: 'monthly', day: 5, end_date: '2025-12-31' }
  parent_entry_id UUID REFERENCES public.cash_flow_entries(id), -- For generated recurring entries
  
  -- Additional info
  notes TEXT,
  tags TEXT[], -- For flexible grouping
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cash_flow_entries_due_date ON public.cash_flow_entries(due_date);
CREATE INDEX IF NOT EXISTS idx_cash_flow_entries_type ON public.cash_flow_entries(type);
CREATE INDEX IF NOT EXISTS idx_cash_flow_entries_status ON public.cash_flow_entries(status);
CREATE INDEX IF NOT EXISTS idx_cash_flow_entries_category ON public.cash_flow_entries(category);
CREATE INDEX IF NOT EXISTS idx_cash_flow_entries_source ON public.cash_flow_entries(source, source_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_cash_flow_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cash_flow_entries_updated_at
  BEFORE UPDATE ON public.cash_flow_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_cash_flow_entries_updated_at();

-- Auto-update overdue status
CREATE OR REPLACE FUNCTION update_overdue_cash_flow_entries()
RETURNS void AS $$
BEGIN
  UPDATE public.cash_flow_entries
  SET status = 'overdue'
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE
    AND paid_date IS NULL;
END;
$$ LANGUAGE plpgsql;

-- RLS policies
ALTER TABLE public.cash_flow_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users" ON public.cash_flow_entries
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.cash_flow_entries TO authenticated;
GRANT ALL ON public.cash_flow_entries TO service_role;

-- Comment
COMMENT ON TABLE public.cash_flow_entries IS 'Manual and synced cash flow entries for financial projections';
