-- Migration: Add order_discounted_price to shopee_orders
-- This is the correct base value for Shopee fee calculations (after seller discount)

ALTER TABLE shopee_orders 
ADD COLUMN IF NOT EXISTS order_discounted_price DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN shopee_orders.order_discounted_price IS 'Price after seller discount (base for Shopee fee calculation)';
