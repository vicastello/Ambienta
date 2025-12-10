-- Adicionar constraint de unicidade para evitar duplicatas de itens do Mercado Livre
-- Um item é único pela combinação de: meli_order_id + item_id + variation_id

-- Primeiro, limpar duplicatas existentes (manter apenas o registro mais antigo)
DELETE FROM public.meli_order_items a
USING public.meli_order_items b
WHERE a.id > b.id
  AND a.meli_order_id = b.meli_order_id
  AND a.item_id = b.item_id
  AND COALESCE(a.variation_id, '') = COALESCE(b.variation_id, '');

-- Adicionar constraint de unicidade
ALTER TABLE public.meli_order_items
ADD CONSTRAINT meli_order_items_unique_item
UNIQUE (meli_order_id, item_id, variation_id);

COMMENT ON CONSTRAINT meli_order_items_unique_item ON public.meli_order_items IS
'Garante que não haja duplicatas de itens por pedido. Um item é identificado por meli_order_id + item_id + variation_id';
