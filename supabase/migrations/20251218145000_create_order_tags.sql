-- Migration: Create order_tags table for tagging tiny_orders
-- Date: 2025-12-18

-- Table to store tags for orders (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.order_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id BIGINT NOT NULL REFERENCES public.tiny_orders(id) ON DELETE CASCADE,
    tag_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate tags on same order
    UNIQUE(order_id, tag_name)
);

-- Index for efficient tag lookups
CREATE INDEX IF NOT EXISTS idx_order_tags_order_id ON public.order_tags(order_id);
CREATE INDEX IF NOT EXISTS idx_order_tags_tag_name ON public.order_tags(tag_name);

-- Table to store available tags for suggestions
CREATE TABLE IF NOT EXISTS public.available_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(7) DEFAULT '#6366f1', -- Hex color
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Updated_at trigger for available_tags
CREATE OR REPLACE FUNCTION update_available_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_available_tags_updated_at
  BEFORE UPDATE ON public.available_tags
  FOR EACH ROW
  EXECUTE FUNCTION update_available_tags_updated_at();

-- RLS
ALTER TABLE public.order_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.available_tags ENABLE ROW LEVEL SECURITY;

-- Policies for service_role
CREATE POLICY service_role_order_tags ON public.order_tags
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_available_tags ON public.available_tags
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.order_tags IS 'Tags applied to orders for custom categorization';
COMMENT ON TABLE public.available_tags IS 'Available tags for suggestions and management';
