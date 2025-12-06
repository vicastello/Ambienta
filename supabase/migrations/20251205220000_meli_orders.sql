-- Tabelas de pedidos e itens do Mercado Livre (schema public).
-- Não alterar a baseline; este arquivo adiciona meli_orders e meli_order_items seguindo o padrão v2.

-- meli_orders
CREATE TABLE public.meli_orders (
    meli_order_id bigint PRIMARY KEY, -- ID do pedido no Mercado Livre
    seller_id bigint NOT NULL, -- user_id da conta (ex.: 571389990)
    status text NOT NULL,
    date_created timestamptz NOT NULL,
    last_updated timestamptz NOT NULL,
    currency_id text NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    total_amount_with_shipping numeric(12,2),
    shipping_cost numeric(12,2),
    buyer_id bigint,
    buyer_nickname text,
    buyer_full_name text,
    buyer_email text,
    tags text[] DEFAULT '{}'::text[],
    raw_payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meli_orders IS 'Pedidos do Mercado Livre espelhados no Ambienta (integração ML).';
COMMENT ON COLUMN public.meli_orders.meli_order_id IS 'ID do pedido no Mercado Livre';
COMMENT ON COLUMN public.meli_orders.seller_id IS 'ID do vendedor (user_id da conta ML)';
COMMENT ON COLUMN public.meli_orders.status IS 'Status do pedido no ML (paid, ready_to_ship, cancelled, etc.)';
COMMENT ON COLUMN public.meli_orders.date_created IS 'Data de criação do pedido no ML';
COMMENT ON COLUMN public.meli_orders.last_updated IS 'Última atualização do pedido no ML';
COMMENT ON COLUMN public.meli_orders.currency_id IS 'Moeda do pedido (ex.: BRL)';
COMMENT ON COLUMN public.meli_orders.total_amount IS 'Valor total do pedido';
COMMENT ON COLUMN public.meli_orders.total_amount_with_shipping IS 'Valor total incluindo frete, se disponível';
COMMENT ON COLUMN public.meli_orders.shipping_cost IS 'Frete cobrado ao cliente';
COMMENT ON COLUMN public.meli_orders.buyer_id IS 'ID do comprador no ML';
COMMENT ON COLUMN public.meli_orders.buyer_nickname IS 'Apelido do comprador';
COMMENT ON COLUMN public.meli_orders.buyer_full_name IS 'Nome completo do comprador';
COMMENT ON COLUMN public.meli_orders.buyer_email IS 'Email do comprador';
COMMENT ON COLUMN public.meli_orders.tags IS 'Tags/labels do ML';
COMMENT ON COLUMN public.meli_orders.raw_payload IS 'Payload bruto retornado pelo ML';

CREATE INDEX idx_meli_orders_seller_created ON public.meli_orders (seller_id, date_created DESC);
CREATE INDEX idx_meli_orders_status_created ON public.meli_orders (status, date_created DESC);

CREATE TRIGGER set_updated_at_meli_orders
BEFORE UPDATE ON public.meli_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.meli_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_full_access ON public.meli_orders
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- meli_order_items
CREATE TABLE public.meli_order_items (
    id bigserial PRIMARY KEY,
    meli_order_id bigint NOT NULL REFERENCES public.meli_orders(meli_order_id) ON DELETE CASCADE,
    item_id text NOT NULL,
    title text NOT NULL,
    sku text,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    currency_id text NOT NULL,
    category_id text,
    variation_id text,
    raw_payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meli_order_items IS 'Itens de pedidos do Mercado Livre (linhas).';
COMMENT ON COLUMN public.meli_order_items.meli_order_id IS 'Pedido pai (meli_orders.meli_order_id)';
COMMENT ON COLUMN public.meli_order_items.item_id IS 'ID do anúncio/produto no ML';
COMMENT ON COLUMN public.meli_order_items.title IS 'Título do item no ML';
COMMENT ON COLUMN public.meli_order_items.sku IS 'SKU extraído (seller_sku / SELLER_SKU / seller_custom_field)';
COMMENT ON COLUMN public.meli_order_items.quantity IS 'Quantidade do item no pedido';
COMMENT ON COLUMN public.meli_order_items.unit_price IS 'Preço unitário do item';
COMMENT ON COLUMN public.meli_order_items.currency_id IS 'Moeda do item';
COMMENT ON COLUMN public.meli_order_items.category_id IS 'Categoria do item';
COMMENT ON COLUMN public.meli_order_items.variation_id IS 'Variação do item, se existir';
COMMENT ON COLUMN public.meli_order_items.raw_payload IS 'Payload bruto do item retornado pelo ML';

CREATE INDEX idx_meli_order_items_order ON public.meli_order_items (meli_order_id);
CREATE INDEX idx_meli_order_items_sku ON public.meli_order_items (sku);

CREATE TRIGGER set_updated_at_meli_order_items
BEFORE UPDATE ON public.meli_order_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.meli_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_full_access ON public.meli_order_items
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
