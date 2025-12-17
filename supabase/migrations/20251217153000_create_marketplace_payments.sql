-- Migration: Create marketplace payment tracking tables
-- Date: 2024-12-17

-- Table for tracking file upload batches
CREATE TABLE IF NOT EXISTS public.payment_upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace VARCHAR(20) NOT NULL CHECK (marketplace IN ('magalu', 'mercado_livre', 'shopee')),
  filename VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  rows_processed INTEGER DEFAULT 0,
  rows_matched INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,
  rows_failed INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_message TEXT,
  uploaded_by VARCHAR(100),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for individual payment records from marketplace extracts
CREATE TABLE IF NOT EXISTS public.marketplace_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Marketplace and batch tracking
  marketplace VARCHAR(20) NOT NULL CHECK (marketplace IN ('magalu', 'mercado_livre', 'shopee')),
  upload_batch_id UUID NOT NULL REFERENCES public.payment_upload_batches(id) ON DELETE CASCADE,
  
  -- Payment identification
  marketplace_order_id VARCHAR(100) NOT NULL,
  payment_date DATE,
  settlement_date DATE,
  
  -- Financial details
  gross_amount DECIMAL(12,2),
  net_amount DECIMAL(12,2),
  fees DECIMAL(12,2),
  discount DECIMAL(12,2),
  status VARCHAR(50),
  payment_method VARCHAR(50),
  
  -- Linking with Tiny order
  tiny_order_id INTEGER REFERENCES public.tiny_orders(tiny_id),
  matched_at TIMESTAMPTZ,
  match_confidence VARCHAR(20), -- 'exact', 'fuzzy', 'manual'
  
  -- Raw data for debugging
  raw_data JSONB,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Uniqueness constraint: prevent duplicates
  UNIQUE(marketplace, marketplace_order_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketplace_payments_batch ON public.marketplace_payments(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_payments_tiny_order ON public.marketplace_payments(tiny_order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_payments_marketplace_order ON public.marketplace_payments(marketplace, marketplace_order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_payments_payment_date ON public.marketplace_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payment_batches_marketplace ON public.payment_upload_batches(marketplace);
CREATE INDEX IF NOT EXISTS idx_payment_batches_uploaded_at ON public.payment_upload_batches(uploaded_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_marketplace_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_marketplace_payments_updated_at
  BEFORE UPDATE ON public.marketplace_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_marketplace_payments_updated_at();

-- Add payment tracking columns to tiny_orders
ALTER TABLE public.tiny_orders 
  ADD COLUMN IF NOT EXISTS payment_received BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketplace_payment_id UUID REFERENCES public.marketplace_payments(id);

CREATE INDEX IF NOT EXISTS idx_tiny_orders_payment_received ON public.tiny_orders(payment_received);

-- RLS policies
ALTER TABLE public.payment_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users" ON public.payment_upload_batches
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users" ON public.marketplace_payments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grants
GRANT ALL ON public.payment_upload_batches TO authenticated;
GRANT ALL ON public.payment_upload_batches TO service_role;
GRANT ALL ON public.marketplace_payments TO authenticated;
GRANT ALL ON public.marketplace_payments TO service_role;

-- Comments
COMMENT ON TABLE public.payment_upload_batches IS 'Tracks file uploads of marketplace payment extracts';
COMMENT ON TABLE public.marketplace_payments IS 'Individual payment records from marketplace extracts';
COMMENT ON COLUMN public.marketplace_payments.match_confidence IS 'Confidence level of the match with Tiny order';
