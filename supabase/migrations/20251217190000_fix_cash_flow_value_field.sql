-- Migration: Fix trigger and backfill with correct value field fallbacks
-- The trigger was using valor_total_pedido which can be NULL on older orders
-- Adding proper fallback chain: valor_total_pedido -> valor -> 0

-- 1. Update the sync trigger function for Tiny Orders
CREATE OR REPLACE FUNCTION sync_tiny_order_to_cash_flow()
RETURNS TRIGGER AS $$
DECLARE
  v_due_date DATE;
  v_status VARCHAR(20);
  v_amount NUMERIC(14,2);
BEGIN
  -- Get the correct amount with fallbacks
  v_amount := COALESCE(NEW.valor_total_pedido, NEW.valor, 0);
  
  -- Calculate due date (Billing date + 30 days, or order date + 30 days)
  v_due_date := COALESCE(NEW.tiny_data_faturamento, NEW.data_criacao)::DATE + INTERVAL '30 days';
  
  -- Determine Status
  IF NEW.situacao = 2 THEN -- Cancelled
    v_status := 'cancelled';
  ELSIF NEW.payment_received THEN
    v_status := 'confirmed';
  ELSIF v_due_date < CURRENT_DATE THEN
    v_status := 'overdue';
  ELSE
    v_status := 'pending';
  END IF;

  INSERT INTO public.cash_flow_entries (
    source, source_id, type, amount, 
    description, category, subcategory,
    due_date, paid_date, competence_date,
    status
  )
  VALUES (
    'tiny_order', NEW.tiny_id::TEXT, 'income', v_amount,
    COALESCE(NEW.cliente_nome, 'Cliente Desconhecido'), 'Vendas', 'Produtos',
    v_due_date, 
    CASE WHEN NEW.payment_received THEN NEW.payment_received_at::DATE ELSE NULL END,
    NEW.data_criacao::DATE,
    v_status
  )
  ON CONFLICT (source, source_id) 
  DO UPDATE SET
    amount = EXCLUDED.amount,
    description = EXCLUDED.description,
    due_date = EXCLUDED.due_date,
    paid_date = EXCLUDED.paid_date,
    competence_date = EXCLUDED.competence_date,
    status = EXCLUDED.status,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Re-run backfill with corrected value field
-- Clear existing entries to repopulate with correct values
DELETE FROM public.cash_flow_entries WHERE source = 'tiny_order';

-- Use subquery with DISTINCT ON to handle any duplicate tiny_id values (keep latest by data_criacao)
-- Filter out orders with zero values to satisfy amount_check constraint
INSERT INTO public.cash_flow_entries (
  source, source_id, type, amount, 
  description, category, subcategory,
  due_date, paid_date, competence_date,
  status
)
SELECT 
  source, source_id, type, amount, 
  description, category, subcategory,
  due_date, paid_date, competence_date,
  status
FROM (
  SELECT DISTINCT ON (tiny_id)
    'tiny_order' as source, 
    tiny_id::TEXT as source_id, 
    'income' as type, 
    COALESCE(valor_total_pedido, valor, 0) as amount,
    COALESCE(cliente_nome, 'Cliente Desconhecido') as description, 
    'Vendas' as category, 
    'Produtos' as subcategory,
    (COALESCE(tiny_data_faturamento, data_criacao)::DATE + INTERVAL '30 days')::DATE as due_date,
    CASE WHEN payment_received THEN payment_received_at::DATE ELSE NULL END as paid_date,
    data_criacao::DATE as competence_date,
    CASE 
      WHEN situacao = 2 THEN 'cancelled'
      WHEN payment_received THEN 'confirmed'
      WHEN (COALESCE(tiny_data_faturamento, data_criacao)::DATE + INTERVAL '30 days') < CURRENT_DATE THEN 'overdue'
      ELSE 'pending'
    END as status
  FROM public.tiny_orders
  WHERE tiny_id IS NOT NULL
    AND COALESCE(valor_total_pedido, valor, 0) > 0  -- Filter out zero-value orders
  ORDER BY tiny_id, data_criacao DESC
) AS deduped
ON CONFLICT (source, source_id) DO UPDATE SET
  amount = EXCLUDED.amount,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  updated_at = NOW();



