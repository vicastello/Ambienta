-- Índices para filtros por tipo e fornecedor
set search_path = public;

create extension if not exists pg_trgm;

create index if not exists tiny_produtos_tipo_idx
  on tiny_produtos (tipo);

-- coluna pode não existir em bases antigas; garante criação antes do índice
alter table tiny_produtos
  add column if not exists fornecedor_nome text;

create index if not exists tiny_produtos_fornecedor_nome_trgm_idx
  on tiny_produtos using gin (fornecedor_nome gin_trgm_ops);
