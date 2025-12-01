-- Adiciona coluna para armazenar o nome do fornecedor no catálogo de produtos
alter table public.tiny_produtos
  add column if not exists fornecedor_nome text;
