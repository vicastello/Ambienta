-- Deduplica itens do Magalu, força id_order_package padrão 0 e remove duplicidades com pacote nulo

-- 1) Consolidar quantidades duplicadas por (id_order, id_sku, coalesce(id_order_package, 0))
with ranked as (
  select
    id,
    id_order,
    id_sku,
    coalesce(id_order_package, 0) as pkg,
    sum(coalesce(quantity, 0)) over (partition by id_order, id_sku, coalesce(id_order_package, 0)) as total_qty,
    row_number() over (partition by id_order, id_sku, coalesce(id_order_package, 0) order by id) as rn
  from magalu_order_items
),
updated as (
  update magalu_order_items moi
  set quantity = r.total_qty
  from ranked r
  where moi.id = r.id
    and r.rn = 1
  returning moi.id
),
deleted as (
  delete from magalu_order_items moi
  using ranked r
  where moi.id = r.id
    and r.rn > 1
)
select 1;

-- 2) Normalizar pacote nulo para 0 (evita duplicidade por NULL)
update magalu_order_items
set id_order_package = 0
where id_order_package is null;

-- 3) Garantir default 0 e not null
alter table magalu_order_items
  alter column id_order_package set default 0,
  alter column id_order_package set not null;

comment on column magalu_order_items.id_order_package is 'Pacote do pedido; 0 representa pacote não informado (evita duplicidade por NULL)';
