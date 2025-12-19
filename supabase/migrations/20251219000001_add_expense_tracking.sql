-- Add is_expense field to marketplace_payments
ALTER TABLE marketplace_payments
ADD COLUMN IF NOT EXISTS is_expense BOOLEAN DEFAULT FALSE;

-- Add expense_category for linking expenses to categories
ALTER TABLE marketplace_payments
ADD COLUMN IF NOT EXISTS expense_category TEXT;

-- Create index for expense queries
CREATE INDEX IF NOT EXISTS idx_marketplace_payments_is_expense 
ON marketplace_payments(is_expense) 
WHERE is_expense = TRUE;

-- Add comment
COMMENT ON COLUMN marketplace_payments.is_expense IS 'True for outgoing transactions like fees, ad spend, etc.';
COMMENT ON COLUMN marketplace_payments.expense_category IS 'Category for expense transactions (e.g., "anuncios", "taxas")';
