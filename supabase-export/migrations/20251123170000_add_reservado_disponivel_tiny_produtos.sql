-- Add estoque detalhado a tiny_produtos
alter table tiny_produtos
  add column if not exists reservado numeric null,
  add column if not exists disponivel numeric null;

-- Ajusta defaults para quem preferir manter zero
update tiny_produtos
set reservado = coalesce(reservado, 0),
    disponivel = coalesce(disponivel, saldo)
where reservado is null or disponivel is null;
