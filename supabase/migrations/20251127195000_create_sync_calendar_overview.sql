-- Creates function sync_calendar_overview(p_days integer)
-- Returns one row per day with counts of orders, orders without items and orders without freight

CREATE OR REPLACE FUNCTION public.sync_calendar_overview(p_days integer)
RETURNS TABLE(
  dia date,
  total_orders bigint,
  orders_without_items bigint,
  orders_without_frete bigint
) LANGUAGE sql STABLE AS $$
WITH days AS (
  SELECT generate_series(
    (current_date - (cast(p_days as int) - 1) * interval '1 day')::date,
    current_date::date,
    interval '1 day'
  )::date AS dia
),
agg AS (
  SELECT
    o.data_criacao::date AS dia,
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE i.id_pedido IS NULL) AS orders_without_items,
    COUNT(*) FILTER (WHERE o.valor_frete IS NULL) AS orders_without_frete
  FROM public.tiny_orders o
  LEFT JOIN public.tiny_pedido_itens i ON i.id_pedido = o.id
  WHERE o.data_criacao >= (current_date - (cast(p_days as int) * interval '1 day'))::date
  GROUP BY o.data_criacao::date
)
SELECT
  d.dia,
  COALESCE(a.total_orders, 0) AS total_orders,
  COALESCE(a.orders_without_items, 0) AS orders_without_items,
  COALESCE(a.orders_without_frete, 0) AS orders_without_frete
FROM days d
LEFT JOIN agg a ON a.dia = d.dia
ORDER BY d.dia;
$$;
