-- Create marketplace_fee_config table
CREATE TABLE IF NOT EXISTS marketplace_fee_config (
  id SERIAL PRIMARY KEY,
  marketplace VARCHAR(50) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_marketplace UNIQUE(marketplace)
);

-- Create index on marketplace for faster lookups
CREATE INDEX IF NOT EXISTS idx_marketplace_fee_config_marketplace ON marketplace_fee_config(marketplace);

-- Insert default configurations
INSERT INTO marketplace_fee_config (marketplace, config) VALUES
  ('shopee', '{
    "base_commission": 14,
    "free_shipping_commission": 20,
    "campaign_fee_default": 2.5,
    "campaign_fee_nov_dec": 3.5,
    "fixed_cost_per_product": 4.00
  }'::jsonb),
  ('mercado_livre', '{
    "premium_commission": 16.5,
    "fixed_cost_tiers": [
      {"max": 12.50, "cost": 3.125},
      {"min": 12.50, "max": 29, "cost": 6.25},
      {"min": 29, "max": 50, "cost": 6.50},
      {"min": 50, "max": 79, "cost": 6.75}
    ]
  }'::jsonb),
  ('magalu', '{
    "commission": 14.5,
    "fixed_cost": 4.00
  }'::jsonb)
ON CONFLICT (marketplace) DO NOTHING;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_marketplace_fee_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_marketplace_fee_config_updated_at ON marketplace_fee_config;

CREATE TRIGGER trigger_update_marketplace_fee_config_updated_at
  BEFORE UPDATE ON marketplace_fee_config
  FOR EACH ROW
  EXECUTE FUNCTION update_marketplace_fee_config_updated_at();
