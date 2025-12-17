-- Backfill: Populate cash_flow_entries from existing tiny_orders
-- Run this ONCE after applying the unique index migration

INSERT INTO public.cash_flow_entries (
  source, source_id, type, amount, 
  description, category, subcategory,
  due_date, paid_date, competence_date,
  status
)
SELECT
  'tiny_order', 
  tiny_id::TEXT, 
  'income', 
  COALESCE(valor, 0),
  COALESCE(cliente_nome, 'Cliente Desconhecido'), 
  'Vendas', 
  'Produtos',
  COALESCE(data_criacao::DATE + INTERVAL '30 days', CURRENT_DATE),
  CASE WHEN payment_received THEN payment_received_at::DATE ELSE NULL END,
  data_criacao::DATE,
  CASE 
    WHEN situacao = 2 THEN 'cancelled'
    WHEN payment_received THEN 'confirmed'
    WHEN (data_criacao::DATE + INTERVAL '30 days') < CURRENT_DATE THEN 'overdue'
    ELSE 'pending'
  END
FROM public.tiny_orders
WHERE tiny_id IS NOT NULL
ON CONFLICT (source, source_id) DO UPDATE SET
  amount = EXCLUDED.amount,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  updated_at = NOW();
