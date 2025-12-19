-- Add campaigns JSONB column to marketplace_fee_config
-- This allows storing multiple campaign periods for Shopee
-- Structure: array of {id, name, fee_rate, start_date, end_date, is_active}

ALTER TABLE marketplace_fee_config
ADD COLUMN IF NOT EXISTS campaigns JSONB DEFAULT '[]'::jsonb;

-- Add comment explaining the structure
COMMENT ON COLUMN marketplace_fee_config.campaigns IS 'Array of campaign objects for Shopee: [{id: UUID, name: string, fee_rate: number, start_date: ISO8601, end_date: ISO8601, is_active: boolean}, ...]';

-- Index for efficient querying (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_marketplace_fee_config_campaigns 
ON marketplace_fee_config USING GIN (campaigns);
