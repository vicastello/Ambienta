-- Add metadata fields to marketplace_order_links for fee calculation
ALTER TABLE marketplace_order_links
ADD COLUMN IF NOT EXISTS uses_free_shipping BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_campaign_order BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_kit BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS product_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS calculated_fees JSONB;

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS idx_marketplace_order_links_campaign ON marketplace_order_links(is_campaign_order) WHERE is_campaign_order = TRUE;
CREATE INDEX IF NOT EXISTS idx_marketplace_order_links_kit ON marketplace_order_links(is_kit) WHERE is_kit = TRUE;

-- Add comment to explain fields
COMMENT ON COLUMN marketplace_order_links.uses_free_shipping IS 'Indicates if order uses free shipping (affects Shopee commission rate)';
COMMENT ON COLUMN marketplace_order_links.is_campaign_order IS 'Indicates if order is part of official marketplace campaign';
COMMENT ON COLUMN marketplace_order_links.is_kit IS 'Indicates if order contains a kit (affects Shopee fixed cost calculation)';
COMMENT ON COLUMN marketplace_order_links.product_count IS 'Number of products in order (used for fixed cost per product)';
COMMENT ON COLUMN marketplace_order_links.calculated_fees IS 'Breakdown of calculated fees: {commission, campaign, fixed, total, net}';
