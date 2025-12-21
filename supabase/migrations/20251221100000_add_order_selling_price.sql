-- Add order_selling_price and seller_discount columns to shopee_orders
-- order_selling_price: The actual selling price after bulk discounts
-- seller_discount: The discount given by seller (e.g., 2% for buying more)

ALTER TABLE shopee_orders
ADD COLUMN IF NOT EXISTS order_selling_price DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS seller_discount DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN shopee_orders.order_selling_price IS 'Selling price after bulk discounts, before order-level discounts';
COMMENT ON COLUMN shopee_orders.seller_discount IS 'Seller discount amount (e.g., 2% for buying more)';
