-- 20251127_alinhar_tiny_produtos_orders_itens.sql
-- Alinha o schema das tabelas Tiny com o mapeamento do código

ALTER TABLE public.tiny_produtos
  ADD COLUMN IF NOT EXISTS marca text,
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

ALTER TABLE public.tiny_orders
  ADD COLUMN IF NOT EXISTS data_faturamento timestamp with time zone,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

ALTER TABLE public.tiny_pedido_itens
  ADD COLUMN IF NOT EXISTS unidade text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;
