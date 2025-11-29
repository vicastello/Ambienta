-- Align tiny_produtos schema with sync expectations
alter table public.tiny_produtos
  add column if not exists imagem_url text,
  add column if not exists peso_bruto numeric,
  add column if not exists data_criacao_tiny timestamptz,
  add column if not exists data_atualizacao_tiny timestamptz,
  add column if not exists fornecedor_codigo text,
  add column if not exists embalagem_qtd numeric,
  add column if not exists marca text,
  add column if not exists categoria text,
  add column if not exists raw_payload jsonb;
