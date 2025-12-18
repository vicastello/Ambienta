-- Migration: Relax check constraint on cash_flow_entries to allow zero values
-- Reason: Some orders (e.g. gifts, replacements) have 0 value and were causing sync crashes

BEGIN;

-- Drop old constraint
ALTER TABLE public.cash_flow_entries
  DROP CONSTRAINT IF EXISTS cash_flow_entries_amount_check;

-- Add new constraint allowing >= 0
ALTER TABLE public.cash_flow_entries
  ADD CONSTRAINT cash_flow_entries_amount_check CHECK (amount >= 0);

COMMIT;
