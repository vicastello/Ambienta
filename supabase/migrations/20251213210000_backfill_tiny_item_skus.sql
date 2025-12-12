-- Preenche codigo_produto em tiny_pedido_itens para pedidos recentes (>= 2025-11-01)

update tiny_pedido_itens tpi
set codigo_produto = tp.codigo
from tiny_produtos tp, tiny_orders o
where tpi.codigo_produto is null
  and o.id = tpi.id_pedido
  and o.data_criacao >= '2025-11-01'
  and tpi.id_produto_tiny = tp.id_produto_tiny
  and tp.codigo is not null;

-- 2) Fallback por nome exato (ignora acentuação/case utilizando lower)
update tiny_pedido_itens tpi
set codigo_produto = tp.codigo
from tiny_produtos tp, tiny_orders o
where tpi.codigo_produto is null
  and o.id = tpi.id_pedido
  and o.data_criacao >= '2025-11-01'
  and lower(tp.nome) = lower(tpi.nome_produto)
  and tp.codigo is not null;
