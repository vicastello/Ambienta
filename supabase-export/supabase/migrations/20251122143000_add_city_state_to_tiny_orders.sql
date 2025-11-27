-- Adiciona cidade/UF (e coordenadas opcionais) à tabela tiny_orders
BEGIN;

ALTER TABLE public.tiny_orders
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS uf text,
  ADD COLUMN IF NOT EXISTS cidade_lat double precision,
  ADD COLUMN IF NOT EXISTS cidade_lon double precision;

-- Índices úteis para filtros
CREATE INDEX IF NOT EXISTS idx_tiny_orders_uf ON public.tiny_orders(uf);
CREATE INDEX IF NOT EXISTS idx_tiny_orders_cidade ON public.tiny_orders(cidade);

-- Função para backfill a partir do JSON bruto
CREATE OR REPLACE FUNCTION public.fn_backfill_cidade_uf_from_raw()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  UPDATE public.tiny_orders t
  SET 
    cidade = COALESCE(
      t.raw #>> '{cliente,endereco,cidade}',
      t.raw #>> '{cliente,enderecoEntrega,cidade}',
      t.raw #>> '{enderecoEntrega,cidade}',
      t.raw #>> '{entrega,endereco,cidade}',
      t.raw #>> '{destinatario,endereco,cidade}',
      t.raw #>> '{pedido,cliente,endereco,cidade}',
      t.raw #>> '{cliente,cidade}'
    ),
    uf = UPPER(SUBSTRING(COALESCE(
      t.raw #>> '{cliente,endereco,uf}',
      t.raw #>> '{cliente,endereco,estado}',
      t.raw #>> '{cliente,endereco,estadoUF}',
      t.raw #>> '{cliente,endereco,ufCliente}',
      t.raw #>> '{enderecoEntrega,uf}',
      t.raw #>> '{enderecoEntrega,estado}',
      t.raw #>> '{cliente,uf}',
      t.raw #>> '{cliente,estado}'
    ) FROM 1 FOR 2))
  WHERE (t.cidade IS NULL OR t.uf IS NULL);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMIT;