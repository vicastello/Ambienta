-- Migration: Add commission_fee and service_fee to shopee_orders
-- These are the actual fees charged by Shopee (from get_escrow_detail API)

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
