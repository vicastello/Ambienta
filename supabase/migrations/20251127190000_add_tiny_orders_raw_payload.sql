-- Adiciona a coluna raw_payload à tabela tiny_orders
ALTER TABLE public.tiny_orders
  ADD COLUMN raw_payload jsonb;