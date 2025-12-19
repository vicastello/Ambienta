-- Add fee_overrides column to tiny_orders
ALTER TABLE tiny_orders ADD COLUMN IF NOT EXISTS fee_overrides JSONB DEFAULT NULL;

-- Add a comment explaining the structure
COMMENT ON COLUMN tiny_orders.fee_overrides IS 'Stores manual fee adjustments: { commissionFee?: number, fixedCost?: number, campaignFee?: number, shippingFee?: number, otherFees?: number, notes?: string }';
