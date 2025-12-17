-- Migration: Create purchase_orders and purchase_order_items tables
-- Date: 2024-12-17
-- Description: Establishes the real structure for approved purchase orders, separate from drafts.

-- Create Purchase Orders table
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id VARCHAR(100), -- IDs from Tiny or Manual
  supplier_name VARCHAR(255),
  
  -- Financial Info
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(50),
  
  -- Dates
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_payment_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Workflow
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'approved', 'received', 'cancelled')),
  
  -- Metadata
  notes TEXT,
  external_id VARCHAR(100) -- Link to Tiny order if synced back later
);

-- Create Items table
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  
  product_id BIGINT, -- Link to tiny_produtos.id (bigint)
  product_name VARCHAR(255) NOT NULL,
  product_sku VARCHAR(100),
  
  quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON public.purchase_orders(issue_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_expected_payment ON public.purchase_orders(expected_payment_date);
CREATE INDEX IF NOT EXISTS idx_po_items_order_id ON public.purchase_order_items(purchase_order_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_purchase_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_purchase_orders_updated_at();

-- RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.purchase_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.purchase_order_items FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
GRANT ALL ON public.purchase_order_items TO service_role;
