-- Migration: Allow multiple payment records per order (for adjustments/refunds)
-- Date: 2024-12-21

-- 1. Drop the strict 1:1 unique constraint
ALTER TABLE public.marketplace_payments 
DROP CONSTRAINT IF EXISTS marketplace_payments_marketplace_marketplace_order_id_key;

-- 2. Add a more flexible constraint that allows multiple transactions per order
-- We include date, type, and amount to differentiate distinct financial movements
-- We use MD5 of transaction_description as part of uniqueness if needed, but standard fields should be enough
ALTER TABLE public.marketplace_payments
ADD CONSTRAINT marketplace_payments_unique_entry 
UNIQUE (marketplace, marketplace_order_id, payment_date, transaction_type, net_amount, is_expense);

-- 3. Add column for grouping logic if not exists (already have transaction_type)
-- valid
