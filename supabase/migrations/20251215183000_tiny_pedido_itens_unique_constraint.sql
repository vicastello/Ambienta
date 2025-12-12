-- Garantir chave única para evitar itens duplicados em pedidos Tiny.
-- Normaliza codigo_produto para não ficar nulo e aplica UNIQUE.

-- Normaliza valores nulos
update public.tiny_pedido_itens
set codigo_produto = 'SEM-CODIGO'
where codigo_produto is null;

-- Default e NOT NULL
alter table public.tiny_pedido_itens
  alter column codigo_produto set default 'SEM-CODIGO';

alter table public.tiny_pedido_itens
  alter column codigo_produto set not null;

-- Constraint única (impede duplicar mesma linha)
alter table public.tiny_pedido_itens
  add constraint tiny_pedido_itens_unique
  unique (id_pedido, codigo_produto, valor_unitario, valor_total);
