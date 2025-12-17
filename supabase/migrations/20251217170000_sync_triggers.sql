-- Migration: Create triggers for cash flow sync
-- Date: 2024-12-17
-- Description: Automatic sync from Tiny Orders and Purchase Orders to Cash Flow Entries

-- 1. Sync Function for Tiny Orders (Receitas)
CREATE OR REPLACE FUNCTION sync_tiny_order_to_cash_flow()
RETURNS TRIGGER AS $$
DECLARE
  v_due_date DATE;
  v_status VARCHAR(20);
  v_entry_id UUID;
BEGIN
  -- Calcular Vencimento (Faturamento + 30 dias se não houver regra específica, ou data do pedido)
  v_due_date := COALESCE(NEW.data_faturamento, NEW.data_criacao)::DATE + INTERVAL '30 days';
  
  -- Determinar Status
  IF NEW.situacao = 2 THEN -- Cancelado
    v_status := 'cancelled';
  ELSIF NEW.payment_received THEN
    v_status := 'confirmed';
  ELSIF v_due_date < CURRENT_DATE THEN
    v_status := 'overdue';
  ELSE
    v_status := 'pending';
  END IF;

  -- Se for cancelado, atualizar status na tabela central (ou excluir se preferir)
  -- Decisão: Manter como cancelado para histórico
  
  INSERT INTO public.cash_flow_entries (
    source, source_id, type, amount, 
    description, category, subcategory,
    due_date, paid_date, competence_date,
    status
  )
  VALUES (
    'tiny_order', NEW.tiny_id::TEXT, 'income', NEW.valor_total_pedido,
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

-- Trigger: Tiny Orders
DROP TRIGGER IF EXISTS trg_sync_tiny_order_cash_flow ON public.tiny_orders;
CREATE TRIGGER trg_sync_tiny_order_cash_flow
  AFTER INSERT OR UPDATE ON public.tiny_orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_tiny_order_to_cash_flow();


-- 2. Sync Function for Purchase Orders (Despesas)
CREATE OR REPLACE FUNCTION sync_purchase_order_to_cash_flow()
RETURNS TRIGGER AS $$
DECLARE
  v_status VARCHAR(20);
BEGIN
  -- Apenas sync pedidos que não sejam draft
  IF NEW.status = 'draft' THEN
    -- Se rebaixou para draft, talvez remover do caixa? 
    -- Por segurança, removemos se existir.
    DELETE FROM public.cash_flow_entries WHERE source = 'purchase_order' AND source_id = NEW.id::TEXT;
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN
     v_status := 'cancelled';
  ELSIF NEW.status = 'received' THEN -- Consideramos recebido como "obrigação confirmada", mas não necessariamente paga. 
     -- O ideal seria ter um campo "payment_status" na Ordem de Compra. 
     -- Por enquanto vamos assumir: Received = Pending Payment (A Pagar)
     v_status := 'pending';
  ELSE
     v_status := 'pending'; 
  END IF;

  -- Se já tivermos data de pagamento real (não temos campo paid_at no PO ainda), seria confirmed.
  -- Vamos assumir 'pending' até que se integre Baixa de Pagamento.

  INSERT INTO public.cash_flow_entries (
    source, source_id, type, amount,
    description, category, subcategory,
    due_date, paid_date, competence_date,
    status
  )
  VALUES (
    'purchase_order', NEW.id::TEXT, 'expense', NEW.total_amount,
    COALESCE(NEW.supplier_name, 'Fornecedor Desconhecido'), 'Custos', 'Fornecedores',
    COALESCE(NEW.expected_payment_date, NEW.issue_date + INTERVAL '30 days'),
    NULL, -- Paid date ainda não existe no PO
    NEW.issue_date,
    v_status
  )
  ON CONFLICT (source, source_id)
  DO UPDATE SET
    amount = EXCLUDED.amount,
    description = EXCLUDED.description,
    due_date = EXCLUDED.due_date,
    status = EXCLUDED.status,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Purchase Orders
DROP TRIGGER IF EXISTS trg_sync_purchase_order_cash_flow ON public.purchase_orders;
CREATE TRIGGER trg_sync_purchase_order_cash_flow
  AFTER INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_purchase_order_to_cash_flow();
