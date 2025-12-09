-- Tabelas de pedidos e itens da Shopee (schema public).
-- Segue o padrão de meli_orders para consistência.

-- shopee_orders
CREATE TABLE IF NOT EXISTS public.shopee_orders (
    order_sn text PRIMARY KEY, -- ID único do pedido na Shopee (string)
    shop_id bigint NOT NULL, -- ID da loja na Shopee
    order_status text NOT NULL, -- Status do pedido (UNPAID, READY_TO_SHIP, COMPLETED, etc.)
    create_time timestamptz NOT NULL, -- Data de criação do pedido
    update_time timestamptz NOT NULL, -- Última atualização do pedido
    currency text NOT NULL DEFAULT 'BRL',
    total_amount numeric(12,2) NOT NULL,
    shipping_carrier text,
    cod boolean DEFAULT false,
    buyer_user_id bigint,
    buyer_username text,
    recipient_name text,
    recipient_phone text,
    recipient_full_address text,
    recipient_city text,
    recipient_state text,
    tags text[] DEFAULT '{}'::text[],
    raw_payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shopee_orders IS 'Pedidos da Shopee espelhados no Ambienta (integração Shopee).';
COMMENT ON COLUMN public.shopee_orders.order_sn IS 'ID único do pedido na Shopee';
COMMENT ON COLUMN public.shopee_orders.shop_id IS 'ID da loja na Shopee';
COMMENT ON COLUMN public.shopee_orders.order_status IS 'Status do pedido (UNPAID, READY_TO_SHIP, COMPLETED, CANCELLED, etc.)';
COMMENT ON COLUMN public.shopee_orders.create_time IS 'Data de criação do pedido na Shopee';
COMMENT ON COLUMN public.shopee_orders.update_time IS 'Última atualização do pedido na Shopee';
COMMENT ON COLUMN public.shopee_orders.total_amount IS 'Valor total do pedido';
COMMENT ON COLUMN public.shopee_orders.shipping_carrier IS 'Transportadora (Shopee Xpress, Correios, etc.)';
COMMENT ON COLUMN public.shopee_orders.cod IS 'Se é pagamento na entrega (Cash on Delivery)';
COMMENT ON COLUMN public.shopee_orders.recipient_name IS 'Nome do destinatário';
COMMENT ON COLUMN public.shopee_orders.recipient_full_address IS 'Endereço completo de entrega';
COMMENT ON COLUMN public.shopee_orders.recipient_city IS 'Cidade do destinatário (extraída do endereço)';
COMMENT ON COLUMN public.shopee_orders.recipient_state IS 'UF do destinatário (extraída do endereço)';
COMMENT ON COLUMN public.shopee_orders.raw_payload IS 'Payload bruto retornado pela Shopee';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_shopee_orders_shop_created ON public.shopee_orders (shop_id, create_time DESC);
CREATE INDEX IF NOT EXISTS idx_shopee_orders_status_created ON public.shopee_orders (order_status, create_time DESC);
CREATE INDEX IF NOT EXISTS idx_shopee_orders_create_time ON public.shopee_orders (create_time DESC);
CREATE INDEX IF NOT EXISTS idx_shopee_orders_update_time ON public.shopee_orders (update_time DESC);

-- Trigger para atualizar updated_at automaticamente
CREATE TRIGGER set_updated_at_shopee_orders
BEFORE UPDATE ON public.shopee_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.shopee_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_full_access_shopee_orders ON public.shopee_orders
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- shopee_order_items
CREATE TABLE IF NOT EXISTS public.shopee_order_items (
    id bigserial PRIMARY KEY,
    order_sn text NOT NULL REFERENCES public.shopee_orders(order_sn) ON DELETE CASCADE,
    item_id bigint NOT NULL,
    model_id bigint,
    item_name text NOT NULL,
    model_name text,
    item_sku text,
    model_sku text,
    quantity integer NOT NULL DEFAULT 1,
    original_price numeric(12,2),
    discounted_price numeric(12,2),
    is_wholesale boolean DEFAULT false,
    raw_payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(order_sn, item_id, model_id)
);

COMMENT ON TABLE public.shopee_order_items IS 'Itens de pedidos da Shopee (linhas).';
COMMENT ON COLUMN public.shopee_order_items.order_sn IS 'Pedido pai (shopee_orders.order_sn)';
COMMENT ON COLUMN public.shopee_order_items.item_id IS 'ID do produto na Shopee';
COMMENT ON COLUMN public.shopee_order_items.model_id IS 'ID da variação do produto';
COMMENT ON COLUMN public.shopee_order_items.item_name IS 'Nome do produto';
COMMENT ON COLUMN public.shopee_order_items.model_name IS 'Nome da variação';
COMMENT ON COLUMN public.shopee_order_items.item_sku IS 'SKU do produto';
COMMENT ON COLUMN public.shopee_order_items.model_sku IS 'SKU da variação';
COMMENT ON COLUMN public.shopee_order_items.quantity IS 'Quantidade do item no pedido';
COMMENT ON COLUMN public.shopee_order_items.original_price IS 'Preço original do item';
COMMENT ON COLUMN public.shopee_order_items.discounted_price IS 'Preço com desconto';
COMMENT ON COLUMN public.shopee_order_items.raw_payload IS 'Payload bruto do item';

-- Índices
CREATE INDEX IF NOT EXISTS idx_shopee_order_items_order ON public.shopee_order_items (order_sn);
CREATE INDEX IF NOT EXISTS idx_shopee_order_items_sku ON public.shopee_order_items (item_sku);
CREATE INDEX IF NOT EXISTS idx_shopee_order_items_item_id ON public.shopee_order_items (item_id);

-- Trigger
CREATE TRIGGER set_updated_at_shopee_order_items
BEFORE UPDATE ON public.shopee_order_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.shopee_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_full_access_shopee_order_items ON public.shopee_order_items
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Tabela para controle de sync da Shopee
CREATE TABLE IF NOT EXISTS public.shopee_sync_cursor (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Singleton
    last_sync_at timestamptz,
    last_order_update_time timestamptz, -- Última atualização de pedido sincronizada
    total_orders_synced integer DEFAULT 0,
    sync_status text DEFAULT 'idle', -- idle, running, error
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shopee_sync_cursor IS 'Controle de sincronização da Shopee (singleton).';

-- Trigger
CREATE TRIGGER set_updated_at_shopee_sync_cursor
BEFORE UPDATE ON public.shopee_sync_cursor
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.shopee_sync_cursor ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_full_access_shopee_sync_cursor ON public.shopee_sync_cursor
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Inserir registro inicial do cursor
INSERT INTO public.shopee_sync_cursor (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
