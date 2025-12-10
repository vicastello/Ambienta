-- Tabela de pedidos do Magalu
CREATE TABLE IF NOT EXISTS magalu_orders (
  id BIGSERIAL PRIMARY KEY,
  id_order TEXT UNIQUE NOT NULL,
  id_order_marketplace TEXT,
  order_status TEXT,
  marketplace_name TEXT DEFAULT 'Magalu',
  store_name TEXT,

  -- Datas
  inserted_date TIMESTAMPTZ,
  purchased_date TIMESTAMPTZ,
  approved_date TIMESTAMPTZ,
  updated_date TIMESTAMPTZ,
  estimated_delivery_date TIMESTAMPTZ,

  -- Valores
  total_amount DECIMAL(10,2),
  total_freight DECIMAL(10,2),
  total_discount DECIMAL(10,2),

  -- Cliente/Destinatário
  receiver_name TEXT,
  customer_mail TEXT,
  delivery_address_city TEXT,
  delivery_address_state TEXT,
  delivery_address_full TEXT,

  -- Metadata
  raw_payload JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de itens dos pedidos
CREATE TABLE IF NOT EXISTS magalu_order_items (
  id BIGSERIAL PRIMARY KEY,
  id_order TEXT NOT NULL,
  id_sku TEXT,
  id_order_package INTEGER,

  -- Produto
  product_name TEXT,
  quantity INTEGER,
  price DECIMAL(10,2),
  freight DECIMAL(10,2),
  discount DECIMAL(10,2),

  -- Metadata
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint única
  UNIQUE (id_order, id_sku, id_order_package)
);

-- Tabela de cursor de sincronização
CREATE TABLE IF NOT EXISTS magalu_sync_cursor (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle',
  total_orders_synced INTEGER DEFAULT 0,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Garantir apenas uma linha
  CONSTRAINT only_one_cursor CHECK (id = 1)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_magalu_orders_status ON magalu_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_magalu_orders_purchased_date ON magalu_orders(purchased_date DESC);
CREATE INDEX IF NOT EXISTS idx_magalu_orders_city_state ON magalu_orders(delivery_address_city, delivery_address_state);
CREATE INDEX IF NOT EXISTS idx_magalu_order_items_order ON magalu_order_items(id_order);

-- Inserir cursor inicial
INSERT INTO magalu_sync_cursor (id, sync_status, updated_at)
VALUES (1, 'idle', NOW())
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE magalu_orders IS 'Pedidos sincronizados do marketplace Magalu';
COMMENT ON TABLE magalu_order_items IS 'Itens dos pedidos do Magalu';
COMMENT ON TABLE magalu_sync_cursor IS 'Controle de sincronização do Magalu';
