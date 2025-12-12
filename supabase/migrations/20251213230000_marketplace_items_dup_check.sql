-- Funções de verificação pós-sync para itens duplicados nos marketplaces
create or replace function public.check_shopee_items_dup()
returns table(total int, dup_count int)
language sql
security definer
set search_path = public
as $$
  with base as (
    select order_sn, item_id, coalesce(model_id,0) as model_id, count(*) as c
    from shopee_order_items
    group by order_sn, item_id, coalesce(model_id,0)
  )
  select (select count(*) from shopee_order_items) as total,
         (select count(*) from base where c > 1) as dup_count;
$$;

create or replace function public.check_magalu_items_dup()
returns table(total int, dup_count int)
language sql
security definer
set search_path = public
as $$
  with base as (
    select id_order, id_sku, coalesce(id_order_package,0) as pkg, count(*) as c
    from magalu_order_items
    group by id_order, id_sku, coalesce(id_order_package,0)
  )
  select (select count(*) from magalu_order_items) as total,
         (select count(*) from base where c > 1) as dup_count;
$$;

-- Opcional: trigger-friendly wrappers (para usar no final do sync)
create or replace function public.assert_no_shopee_dup()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select * into r from public.check_shopee_items_dup();
  if r.dup_count > 0 then
    raise exception 'Shopee duplicado: % itens com chaves repetidas', r.dup_count;
  end if;
end;
$$;

create or replace function public.assert_no_magalu_dup()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select * into r from public.check_magalu_items_dup();
  if r.dup_count > 0 then
    raise exception 'Magalu duplicado: % itens com chaves repetidas', r.dup_count;
  end if;
end;
$$;

comment on function public.check_shopee_items_dup() is 'Retorna total e duplicados (order_sn, item_id, model_id) em shopee_order_items';
comment on function public.check_magalu_items_dup() is 'Retorna total e duplicados (id_order, id_sku, id_order_package) em magalu_order_items';
