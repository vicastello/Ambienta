-- Adiciona campos de comprador e endereço de entrega aos pedidos do Mercado Livre
alter table public.meli_orders
  add column if not exists buyer_full_name text,
  add column if not exists buyer_email text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state text;
