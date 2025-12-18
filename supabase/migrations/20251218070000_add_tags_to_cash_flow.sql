-- Migration: Add tags column to cash_flow_entries for custom categorization
-- Tags are stored as a JSONB array of strings for flexibility

-- Add tags column
ALTER TABLE public.cash_flow_entries 
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Create GIN index for efficient tag searches
CREATE INDEX IF NOT EXISTS idx_cash_flow_entries_tags 
    ON public.cash_flow_entries USING GIN (tags);

-- Add comment
COMMENT ON COLUMN public.cash_flow_entries.tags IS 'Custom tags for flexible categorization (array of strings)';
