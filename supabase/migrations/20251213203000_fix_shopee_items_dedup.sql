-- Deduplica itens da Shopee e normaliza model_id para evitar duplicidades

-- 1) Consolidar quantidades por (order_sn, item_id, coalesce(model_id, 0))
with ranked as (
  select
    id,
    order_sn,
    item_id,
    coalesce(model_id, 0) as mid,
    sum(coalesce(quantity, 0)) over (partition by order_sn, item_id, coalesce(model_id, 0)) as total_qty,
    row_number() over (partition by order_sn, item_id, coalesce(model_id, 0) order by id) as rn
  from shopee_order_items
),
updated as (
  update shopee_order_items soi
  set quantity = r.total_qty
  from ranked r
  where soi.id = r.id
    and r.rn = 1
  returning soi.id
),
deleted as (
  delete from shopee_order_items soi
  using ranked r
  where soi.id = r.id
    and r.rn > 1
)
select 1;

-- 2) Normalizar model_id nulo para 0
update shopee_order_items
set model_id = 0
where model_id is null;

-- 3) Garantir NOT NULL + default 0
alter table shopee_order_items
  alter column model_id set default 0,
  alter column model_id set not null;

-- 4) Recriar constraint de unicidade agora que model_id não é nulo
alter table shopee_order_items
  drop constraint if exists shopee_order_items_order_sn_item_id_model_id_key,
  add constraint shopee_order_items_order_sn_item_id_model_id_key
    unique (order_sn, item_id, model_id);

comment on column shopee_order_items.model_id is 'ID da variação; 0 representa variação não informada (evita duplicidade por NULL)';
