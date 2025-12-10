-- Migration: Create tables for linking marketplace orders to Tiny orders and mapping SKUs
-- This enables tracking which marketplace orders correspond to which Tiny orders,
-- and which marketplace SKUs map to Tiny products (including kits and variations)

-- Table to link marketplace orders to Tiny orders
CREATE TABLE IF NOT EXISTS marketplace_order_links (
  id BIGSERIAL PRIMARY KEY,

  -- Marketplace identification
  marketplace VARCHAR(50) NOT NULL CHECK (marketplace IN ('magalu', 'shopee', 'mercado_livre')),
  marketplace_order_id TEXT NOT NULL,

  -- Tiny order reference
  tiny_order_id BIGINT NOT NULL REFERENCES tiny_orders(id) ON DELETE CASCADE,

  -- Additional metadata
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_by TEXT, -- user or system that created the link
  confidence_score NUMERIC(3,2), -- optional: auto-linking confidence (0.00 to 1.00)
  notes TEXT,

  -- Ensure one marketplace order links to only one Tiny order
  UNIQUE(marketplace, marketplace_order_id)
);

-- Index for finding Tiny order from marketplace order
CREATE INDEX idx_marketplace_order_links_marketplace
  ON marketplace_order_links(marketplace, marketplace_order_id);

-- Index for reverse lookup (find marketplace orders from Tiny order)
CREATE INDEX idx_marketplace_order_links_tiny
  ON marketplace_order_links(tiny_order_id);

-- Index for querying by link date
CREATE INDEX idx_marketplace_order_links_linked_at
  ON marketplace_order_links(linked_at);


-- Table to map marketplace SKUs to Tiny products
-- This is crucial because marketplace SKUs often differ from Tiny product codes,
-- and we need to handle kits and variations properly
CREATE TABLE IF NOT EXISTS marketplace_sku_mapping (
  id BIGSERIAL PRIMARY KEY,

  -- Marketplace SKU identification
  marketplace VARCHAR(50) NOT NULL CHECK (marketplace IN ('magalu', 'shopee', 'mercado_livre')),
  marketplace_sku TEXT NOT NULL,
  marketplace_product_name TEXT, -- for reference

  -- Tiny product reference
  tiny_product_id INTEGER NOT NULL REFERENCES tiny_produtos(id_produto_tiny) ON DELETE CASCADE,

  -- Mapping metadata
  mapping_type VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (mapping_type IN ('manual', 'auto', 'verified')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  notes TEXT,

  -- Ensure one marketplace SKU maps to only one Tiny product per marketplace
  UNIQUE(marketplace, marketplace_sku)
);

-- Index for finding Tiny product from marketplace SKU
CREATE INDEX idx_marketplace_sku_mapping_marketplace
  ON marketplace_sku_mapping(marketplace, marketplace_sku);

-- Index for reverse lookup (find marketplace SKUs from Tiny product)
CREATE INDEX idx_marketplace_sku_mapping_tiny
  ON marketplace_sku_mapping(tiny_product_id);

-- Index for querying by marketplace
CREATE INDEX idx_marketplace_sku_mapping_by_marketplace
  ON marketplace_sku_mapping(marketplace);


-- Create a view for easy reporting of linked orders with details
CREATE OR REPLACE VIEW vw_marketplace_orders_linked AS
SELECT
  mol.id AS link_id,
  mol.marketplace,
  mol.marketplace_order_id,
  mol.tiny_order_id,
  mol.linked_at,
  mol.linked_by,
  mol.confidence_score,

  -- Tiny order details
  to_tbl.numero_pedido AS tiny_numero_pedido,
  to_tbl.situacao AS tiny_situacao,
  to_tbl.data_criacao AS tiny_data_criacao,
  to_tbl.valor_total_pedido AS tiny_valor_total,
  to_tbl.canal AS tiny_canal,
  to_tbl.cliente_nome AS tiny_cliente_nome,

  -- Marketplace-specific order details (conditionally joined)
  CASE
    WHEN mol.marketplace = 'magalu' THEN mag.id_order
    WHEN mol.marketplace = 'shopee' THEN sho.order_sn
    WHEN mol.marketplace = 'mercado_livre' THEN mel.meli_order_id::TEXT
  END AS marketplace_order_display_id,

  CASE
    WHEN mol.marketplace = 'magalu' THEN mag.order_status
    WHEN mol.marketplace = 'shopee' THEN sho.order_status
    WHEN mol.marketplace = 'mercado_livre' THEN mel.status
  END AS marketplace_order_status,

  CASE
    WHEN mol.marketplace = 'magalu' THEN mag.total_amount
    WHEN mol.marketplace = 'shopee' THEN sho.total_amount
    WHEN mol.marketplace = 'mercado_livre' THEN mel.total_amount
  END AS marketplace_total_amount,

  CASE
    WHEN mol.marketplace = 'magalu' THEN mag.purchased_date
    WHEN mol.marketplace = 'shopee' THEN sho.create_time
    WHEN mol.marketplace = 'mercado_livre' THEN mel.date_created
  END AS marketplace_order_date

FROM marketplace_order_links mol
INNER JOIN tiny_orders to_tbl ON mol.tiny_order_id = to_tbl.id
LEFT JOIN magalu_orders mag ON mol.marketplace = 'magalu' AND mol.marketplace_order_id = mag.id_order
LEFT JOIN shopee_orders sho ON mol.marketplace = 'shopee' AND mol.marketplace_order_id = sho.order_sn
LEFT JOIN meli_orders mel ON mol.marketplace = 'mercado_livre' AND mol.marketplace_order_id = mel.meli_order_id::TEXT;


-- Create a view for SKU mappings with product details
CREATE OR REPLACE VIEW vw_marketplace_sku_mappings AS
SELECT
  msm.id,
  msm.marketplace,
  msm.marketplace_sku,
  msm.marketplace_product_name,
  msm.tiny_product_id,
  msm.mapping_type,
  msm.created_at,
  msm.updated_at,

  -- Tiny product details
  tp.codigo AS tiny_codigo,
  tp.nome AS tiny_nome,
  tp.tipo AS tiny_tipo,
  tp.situacao AS tiny_situacao,
  tp.preco AS tiny_preco,
  tp.saldo AS tiny_saldo,
  tp.gtin AS tiny_gtin

FROM marketplace_sku_mapping msm
INNER JOIN tiny_produtos tp ON msm.tiny_product_id = tp.id_produto_tiny;


-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on marketplace_sku_mapping
CREATE TRIGGER trigger_update_marketplace_sku_mapping_updated_at
  BEFORE UPDATE ON marketplace_sku_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- Grant permissions (adjust as needed for your RLS policies)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace_order_links TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace_sku_mapping TO authenticated;
-- GRANT SELECT ON vw_marketplace_orders_linked TO authenticated;
-- GRANT SELECT ON vw_marketplace_sku_mappings TO authenticated;

COMMENT ON TABLE marketplace_order_links IS 'Links marketplace orders (Magalu, Shopee, Mercado Livre) to Tiny orders for accurate reporting';
COMMENT ON TABLE marketplace_sku_mapping IS 'Maps marketplace SKUs to Tiny products, essential for handling kits and variations';
COMMENT ON VIEW vw_marketplace_orders_linked IS 'Consolidated view of linked orders with details from both marketplace and Tiny';
COMMENT ON VIEW vw_marketplace_sku_mappings IS 'SKU mappings with full Tiny product details for easy reference';
