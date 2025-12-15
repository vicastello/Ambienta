-- Hardening: garantir que mudancas em itens invalidem caches baseados em tiny_orders.updated_at
-- Regra: qualquer INSERT/UPDATE/DELETE em public.tiny_pedido_itens deve tocar public.tiny_orders.updated_at = now()

set search_path = public, extensions;

create or replace function public.touch_tiny_order_updated_at(pedido_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tiny_orders
    set updated_at = now()
    where id = pedido_id;
$$;

create or replace function public.trg_touch_tiny_orders_updated_at_from_itens()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.touch_tiny_order_updated_at((new).id_pedido::bigint);
    return new;
  end if;

  if (tg_op = 'DELETE') then
    perform public.touch_tiny_order_updated_at((old).id_pedido::bigint);
    return old;
  end if;

  -- UPDATE
  perform public.touch_tiny_order_updated_at((old).id_pedido::bigint);

  if (new).id_pedido is distinct from (old).id_pedido then
    perform public.touch_tiny_order_updated_at((new).id_pedido::bigint);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_touch_tiny_orders_updated_at_from_itens on public.tiny_pedido_itens;
create trigger trg_touch_tiny_orders_updated_at_from_itens
after insert or update or delete on public.tiny_pedido_itens
for each row
execute function public.trg_touch_tiny_orders_updated_at_from_itens();
