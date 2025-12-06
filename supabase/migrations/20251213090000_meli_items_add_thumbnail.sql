-- Adiciona thumbnail dos itens do Mercado Livre
alter table public.meli_order_items
  add column if not exists item_thumbnail_url text;
