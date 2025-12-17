-- Backfill Script: Populate cash flow from existing history

-- 1. Backfill Tiny Orders (Receitas)
INSERT INTO public.cash_flow_entries (
  source, source_id, type, amount, 
  description, category, subcategory,
  due_date, paid_date, competence_date,
  status
)
SELECT
  'tiny_order', tiny_id::TEXT, 'income', valor_total_pedido,
  COALESCE(cliente_nome, 'Cliente Desconhecido'), 'Vendas', 'Produtos',
  COALESCE(data_faturamento, data_criacao)::DATE + INTERVAL '30 days',
  CASE WHEN payment_received THEN payment_received_at::DATE ELSE NULL END,
  data_criacao::DATE,
  CASE 
    WHEN situacao = 2 THEN 'cancelled'
    WHEN payment_received THEN 'confirmed'
    WHEN (COALESCE(data_faturamento, data_criacao)::DATE + INTERVAL '30 days') < CURRENT_DATE THEN 'overdue'
    ELSE 'pending'
  END
FROM public.tiny_orders
ON CONFLICT (source, source_id) DO NOTHING;

-- 2. Backfill Purchase Orders (Despesas)
INSERT INTO public.purchase_orders (status) VALUES ('draft') ON CONFLICT DO NOTHING; -- Ensure at least one dummy if empty for syntax check, though logic handles empty.

-- Real backfill for POs
INSERT INTO public.cash_flow_entries (
  source, source_id, type, amount,
  description, category, subcategory,
  due_date, paid_date, competence_date,
  status
)
SELECT
  'purchase_order', id::TEXT, 'expense', total_amount,
  COALESCE(supplier_name, 'Fornecedor Desconhecido'), 'Custos', 'Fornecedores',
  COALESCE(expected_payment_date, issue_date + INTERVAL '30 days'),
  NULL,
  issue_date,
  CASE 
    WHEN status = 'cancelled' THEN 'cancelled'
    ELSE 'pending'
  END
FROM public.purchase_orders
WHERE status NOT IN ('draft')
ON CONFLICT (source, source_id) DO NOTHING;
