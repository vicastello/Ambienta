-- =====================================================
-- PENDING MIGRATIONS - Execute in Supabase SQL Editor
-- =====================================================

-- Migration 20251221_002: Add fee detail columns
ALTER TABLE shopee_orders 
ADD COLUMN IF NOT EXISTS commission_fee DECIMAL(10,2) DEFAULT 0;

ALTER TABLE shopee_orders 
ADD COLUMN IF NOT EXISTS service_fee DECIMAL(10,2) DEFAULT 0;

ALTER TABLE shopee_orders 
ADD COLUMN IF NOT EXISTS actual_shipping_fee DECIMAL(10,2) DEFAULT 0;

ALTER TABLE shopee_orders 
ADD COLUMN IF NOT EXISTS order_original_price DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN shopee_orders.commission_fee IS 'Shopee commission fee (comissão da Shopee)';
COMMENT ON COLUMN shopee_orders.service_fee IS 'Shopee service fee (taxa de serviço)';
COMMENT ON COLUMN shopee_orders.actual_shipping_fee IS 'Actual shipping fee paid';
COMMENT ON COLUMN shopee_orders.order_original_price IS 'Original price before promotional discounts';

-- Migration 20251221_003: Add order_discounted_price column
ALTER TABLE shopee_orders 
ADD COLUMN IF NOT EXISTS order_discounted_price DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN shopee_orders.order_discounted_price IS 'Price after seller discount (base for Shopee fee calculation)';

-- =====================================================
-- BACKFILL: Calculate order_discounted_price from existing data
-- =====================================================
UPDATE shopee_orders
SET order_discounted_price = order_selling_price - seller_discount
WHERE order_selling_price > 0 
  AND order_discounted_price = 0;

-- Verify
SELECT 
    COUNT(*) as total_orders,
    COUNT(CASE WHEN order_discounted_price > 0 THEN 1 END) as orders_with_discounted_price,
    COUNT(CASE WHEN escrow_amount > 0 THEN 1 END) as orders_with_escrow
FROM shopee_orders;
