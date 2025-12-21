-- Migration: Add voucher fields to shopee_orders
-- These fields store the breakdown of vouchers from Shopee's get_escrow_detail API

ALTER TABLE shopee_orders 
ADD COLUMN IF NOT EXISTS voucher_from_seller DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS voucher_from_shopee DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS seller_voucher_code TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS escrow_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS escrow_fetched_at TIMESTAMPTZ;

-- Index for efficient queries on voucher data
CREATE INDEX IF NOT EXISTS idx_shopee_orders_voucher_seller ON shopee_orders(voucher_from_seller) WHERE voucher_from_seller > 0;

COMMENT ON COLUMN shopee_orders.voucher_from_seller IS 'Valor do cupom fornecido pelo vendedor (R$) - afeta margem';
COMMENT ON COLUMN shopee_orders.voucher_from_shopee IS 'Valor do cupom fornecido pela Shopee (R$) - não afeta margem';
COMMENT ON COLUMN shopee_orders.seller_voucher_code IS 'Códigos dos cupons do vendedor aplicados';
COMMENT ON COLUMN shopee_orders.escrow_amount IS 'Valor total de escrow da transação';
COMMENT ON COLUMN shopee_orders.escrow_fetched_at IS 'Data em que os dados de escrow foram buscados';
