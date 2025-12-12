-- Fallback manual para itens sem código remanescentes (pós-01/11)

-- Mapear kits de prato 3,6L anti-dengue bege para o código base 2226
update tiny_pedido_itens tpi
set codigo_produto = '2226'
from tiny_orders o
where tpi.codigo_produto is null
  and o.id = tpi.id_pedido
  and o.data_criacao >= '2025-11-01'
  and lower(tpi.nome_produto) like '%prato%3,6l%anti-dengue%bege%'
  and tpi.codigo_produto is null;
