-- Adiciona coluna dedicada para armazenar o número do pedido no marketplace (ecommerce.numeroPedidoEcommerce)
-- Isso evita depender apenas do JSON raw e facilita buscas/join para vincular pedidos.

alter table public.tiny_orders
  add column if not exists numero_pedido_ecommerce text;

-- Índice para buscas e auto-link
create index if not exists tiny_orders_numero_pedido_ecommerce_idx
  on public.tiny_orders (numero_pedido_ecommerce);

-- Backfill a partir do raw_payload/raw (Tiny envia em ecommerce.numeroPedidoEcommerce)
update public.tiny_orders
set numero_pedido_ecommerce = nullif(
  coalesce(
    raw_payload #>> '{ecommerce,numeroPedidoEcommerce}',
    raw_payload #>> '{pedido,ecommerce,numeroPedidoEcommerce}',
    raw #>> '{ecommerce,numeroPedidoEcommerce}',
    raw #>> '{pedido,ecommerce,numeroPedidoEcommerce}'
  ),
  ''
)
where numero_pedido_ecommerce is null
  and (
    raw_payload is not null
    or raw is not null
  );

comment on column public.tiny_orders.numero_pedido_ecommerce is 'ID do pedido no marketplace (Tiny: ecommerce.numeroPedidoEcommerce)';
