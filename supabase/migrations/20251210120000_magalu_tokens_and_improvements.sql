-- Tabela para armazenar tokens OAuth do Magalu
CREATE TABLE IF NOT EXISTS magalu_tokens (
  id INTEGER PRIMARY KEY DEFAULT 1,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  expires_in INTEGER, -- segundos
  expires_at TIMESTAMPTZ,
  scope TEXT,
  tenant_id TEXT, -- ID do seller no Magalu
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Garantir apenas uma linha
  CONSTRAINT only_one_token CHECK (id = 1)
);

-- Adicionar coluna tenant_id na tabela de pedidos se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'magalu_orders' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE magalu_orders ADD COLUMN tenant_id TEXT;
  END IF;
END $$;

-- Adicionar índice para tenant_id
CREATE INDEX IF NOT EXISTS idx_magalu_orders_tenant ON magalu_orders(tenant_id);

-- Adicionar mais campos úteis na tabela de pedidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'magalu_orders' AND column_name = 'handling_time_limit'
  ) THEN
    ALTER TABLE magalu_orders ADD COLUMN handling_time_limit TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'magalu_orders' AND column_name = 'delivery_mode'
  ) THEN
    ALTER TABLE magalu_orders ADD COLUMN delivery_mode TEXT;
  END IF;
END $$;

COMMENT ON TABLE magalu_tokens IS 'Tokens OAuth do Magalu - apenas uma linha permitida';
COMMENT ON COLUMN magalu_tokens.expires_at IS 'Data/hora de expiração calculada do access_token';
COMMENT ON COLUMN magalu_tokens.tenant_id IS 'ID do tenant/seller no Magalu';
