-- Corrige quantidades dos itens Magalu que ficaram infladas após dedup
-- Recalcula a partir do raw_payload.quantity (default 1) para pedidos recentes

update magalu_order_items moi
set quantity = coalesce((moi.raw_payload->>'quantity')::numeric, 1)
from magalu_orders mo
where mo.id_order = moi.id_order
  and mo.purchased_date >= '2025-11-01';

comment on table magalu_order_items is 'Itens de pedidos do Magalu (quantidade recalculada do raw_payload.quantity quando aplicável)';
