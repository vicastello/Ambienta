ALTER TABLE public.tiny_orders
  ADD COLUMN tiny_data_prevista date,
  ADD COLUMN tiny_data_faturamento timestamptz,
  ADD COLUMN tiny_data_atualizacao timestamptz,
  ADD COLUMN valor_total_pedido numeric(14,2),
  ADD COLUMN valor_total_produtos numeric(14,2),
  ADD COLUMN valor_desconto numeric(14,2),
  ADD COLUMN valor_outras_despesas numeric(14,2),
  ADD COLUMN transportador_nome text,
  ADD COLUMN forma_pagamento text;
