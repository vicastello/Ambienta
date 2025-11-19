-- Migration 003: Add polling differential tracking columns
-- Enables smart polling to detect only changed orders

-- Add tracking columns to tiny_orders
ALTER TABLE IF EXISTS public.tiny_orders
ADD COLUMN IF NOT EXISTS last_sync_check TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS data_hash VARCHAR(32),
ADD COLUMN IF NOT EXISTS is_enriched BOOLEAN DEFAULT FALSE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tiny_orders_last_sync_check 
ON public.tiny_orders(last_sync_check DESC);

CREATE INDEX IF NOT EXISTS idx_tiny_orders_data_criacao_desc 
ON public.tiny_orders(data_criacao DESC);

CREATE INDEX IF NOT EXISTS idx_tiny_orders_is_enriched 
ON public.tiny_orders(is_enriched) 
WHERE is_enriched = FALSE;

CREATE INDEX IF NOT EXISTS idx_tiny_orders_data_hash 
ON public.tiny_orders(data_hash);

-- Update existing records with current timestamp
UPDATE public.tiny_orders 
SET last_sync_check = NOW() 
WHERE last_sync_check IS NULL;

-- Mark orders as enriched if they have valorFrete
UPDATE public.tiny_orders 
SET is_enriched = TRUE 
WHERE raw->>'valorFrete' IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.tiny_orders.last_sync_check IS 'Timestamp of last sync check - used for differential polling';
COMMENT ON COLUMN public.tiny_orders.data_hash IS 'MD5 hash of order data - used to detect changes';
COMMENT ON COLUMN public.tiny_orders.is_enriched IS 'Whether order has been enriched with detailed data (frete, etc)';
