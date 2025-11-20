-- Add valor_frete column to tiny_orders if not exists
-- Run this in Supabase SQL Editor

ALTER TABLE tiny_orders 
ADD COLUMN IF NOT EXISTS valor_frete NUMERIC(10,2);

-- Add index for queries that filter by valor_frete
CREATE INDEX IF NOT EXISTS idx_tiny_orders_valor_frete 
ON tiny_orders(valor_frete) 
WHERE valor_frete IS NOT NULL;

-- Add index for orders without valor_frete (for enrichment queries)
CREATE INDEX IF NOT EXISTS idx_tiny_orders_needs_enrichment 
ON tiny_orders(data_criacao) 
WHERE valor_frete IS NULL;

-- Verify the column was created
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'tiny_orders' AND column_name = 'valor_frete';
