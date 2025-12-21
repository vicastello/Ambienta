-- Migration: Add AMS (Affiliate Marketing Solutions) commission fee to shopee_orders
-- This captures the affiliate commission when orders come through Shopee affiliates/influencers

ALTER TABLE shopee_orders 
ADD COLUMN IF NOT EXISTS ams_commission_fee DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN shopee_orders.ams_commission_fee IS 'Affiliate Marketing Solutions commission - paid to affiliates/influencers for referred sales';
