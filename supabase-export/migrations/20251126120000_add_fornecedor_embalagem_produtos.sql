-- Adiciona campos de compra aos produtos
alter table tiny_produtos
  add column if not exists fornecedor_codigo text,
  add column if not exists embalagem_qtd numeric;

-- Define embalagem padrão como 1 quando nulo
update tiny_produtos
set embalagem_qtd = 1
where embalagem_qtd is null;
