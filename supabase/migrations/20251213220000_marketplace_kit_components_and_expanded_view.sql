-- Tabela para mapear kits dos marketplaces para componentes (SKUs filhos)
create table if not exists marketplace_kit_components (
  id bigserial primary key,
  marketplace varchar(50) not null check (marketplace in ('magalu','shopee','mercado_livre')),
  marketplace_sku text not null,
  component_sku text not null,
  component_qty numeric(12,3) not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(marketplace, marketplace_sku, component_sku)
);

create index if not exists idx_marketplace_kit_components_marketplace_sku
  on marketplace_kit_components(marketplace, marketplace_sku);

create trigger trg_marketplace_kit_components_updated
  before update on marketplace_kit_components
  for each row
  execute function public.set_updated_at();

comment on table marketplace_kit_components is 'Mapeia kits do marketplace para SKUs componentes que existem no Tiny';

-- Seed inicial: Magalu kit 2327-4 -> 4x 2357 + 4x 2387
insert into marketplace_kit_components (marketplace, marketplace_sku, component_sku, component_qty)
values
  ('magalu', '2327-4', '2357', 4),
  ('magalu', '2327-4', '2387', 4)
on conflict (marketplace, marketplace_sku, component_sku) do nothing;

-- View de itens de pedidos já “explodidos” com kits decompostos
create or replace view vw_marketplace_order_items_expanded as
(
  -- Shopee: usa model_sku/item_sku/item_id
  with base as (
    select
      'shopee'::text as marketplace,
      soi.order_sn as order_id,
      coalesce(nullif(soi.model_sku, ''), nullif(soi.item_sku, ''), soi.item_id::text) as sku,
      soi.item_name as product_name,
      soi.quantity::numeric as quantity
    from shopee_order_items soi
  ),
  mapped as (
    select
      b.marketplace,
      b.order_id,
      c.component_sku as sku,
      b.product_name,
      b.quantity * c.component_qty as quantity
    from base b
    join marketplace_kit_components c
      on c.marketplace = b.marketplace
     and c.marketplace_sku = b.sku
  ),
  unmapped as (
    select
      b.marketplace,
      b.order_id,
      b.sku,
      b.product_name,
      b.quantity
    from base b
    where not exists (
      select 1 from marketplace_kit_components c
      where c.marketplace = b.marketplace
        and c.marketplace_sku = b.sku
    )
  )
  select * from mapped
  union all
  select * from unmapped
)
union all
(
  -- Magalu: usa id_sku (string)
  with base as (
    select
      'magalu'::text as marketplace,
      moi.id_order as order_id,
      moi.id_sku as sku,
      moi.product_name as product_name,
      moi.quantity::numeric as quantity
    from magalu_order_items moi
  ),
  mapped as (
    select
      b.marketplace,
      b.order_id,
      c.component_sku as sku,
      b.product_name,
      b.quantity * c.component_qty as quantity
    from base b
    join marketplace_kit_components c
      on c.marketplace = b.marketplace
     and c.marketplace_sku = b.sku
  ),
  unmapped as (
    select
      b.marketplace,
      b.order_id,
      b.sku,
      b.product_name,
      b.quantity
    from base b
    where not exists (
      select 1 from marketplace_kit_components c
      where c.marketplace = b.marketplace
        and c.marketplace_sku = b.sku
    )
  )
  select * from mapped
  union all
  select * from unmapped
)
union all
(
  -- Mercado Livre: usa coalesce(sku,item_id)
  with base as (
    select
      'mercado_livre'::text as marketplace,
      moi.meli_order_id::text as order_id,
      coalesce(nullif(moi.sku, ''), moi.item_id) as sku,
      moi.title as product_name,
      moi.quantity::numeric as quantity
    from meli_order_items moi
  ),
  mapped as (
    select
      b.marketplace,
      b.order_id,
      c.component_sku as sku,
      b.product_name,
      b.quantity * c.component_qty as quantity
    from base b
    join marketplace_kit_components c
      on c.marketplace = b.marketplace
     and c.marketplace_sku = b.sku
  ),
  unmapped as (
    select
      b.marketplace,
      b.order_id,
      b.sku,
      b.product_name,
      b.quantity
    from base b
    where not exists (
      select 1 from marketplace_kit_components c
      where c.marketplace = b.marketplace
        and c.marketplace_sku = b.sku
    )
  )
  select * from mapped
  union all
  select * from unmapped
);

comment on view vw_marketplace_order_items_expanded is 'Itens de pedidos dos marketplaces com kits já decompostos em componentes (ou o item original quando não é kit)';
