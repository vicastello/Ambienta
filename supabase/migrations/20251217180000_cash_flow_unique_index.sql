-- Migration: Add unique index for ON CONFLICT support in cash_flow_entries
-- This is required for the sync triggers to use UPSERT properly

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_flow_source_unique 
  ON public.cash_flow_entries (source, source_id);
