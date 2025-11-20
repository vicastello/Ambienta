-- ATUALIZAR FUNÇÃO PARA VERSÃO CORRIGIDA
-- Execute isso no Supabase SQL Editor

CREATE OR REPLACE FUNCTION sync_tiny_orders_now()
RETURNS json AS $$
DECLARE
  v_token text;
  v_response http_response;
  v_orders jsonb;
  v_order jsonb;
  v_processed integer := 0;
  v_changed integer := 0;
  v_url text;
BEGIN
  SELECT access_token INTO v_token FROM tiny_tokens WHERE id = 1 LIMIT 1;
  IF v_token IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No token');
  END IF;

  -- 2. Construir URL com datas (últimos 7 dias)
  v_url := 'https://api.tiny.com.br/public-api/v3/pedidos?dataInicial=' || 
           to_char(CURRENT_DATE - INTERVAL '7 days', 'YYYY-MM-DD') || 
           '&dataFinal=' || 
           to_char(CURRENT_DATE, 'YYYY-MM-DD');

  -- 3. Chamar API
  SELECT * INTO v_response FROM http((
    'GET',
    v_url,
    ARRAY[
      http_header('Authorization', 'Bearer ' || v_token),
      http_header('Accept', 'application/json')
    ],
    NULL,
    NULL
  )::http_request);

  -- 4. Verificar status
  IF v_response.status != 200 THEN
    RETURN json_build_object('success', false, 'error', 'API returned ' || v_response.status);
  END IF;

  -- 5. Parsear estrutura CORRETA: root level 'itens' array
  v_orders := (v_response.content::jsonb -> 'itens');

  IF v_orders IS NULL OR jsonb_array_length(v_orders) = 0 THEN
    RETURN json_build_object('success', true, 'processed', 0, 'changed', 0, 'note', 'No orders in response');
  END IF;

  -- 6. Processar cada pedido
  FOR v_order IN SELECT jsonb_array_elements(v_orders)
  LOOP
    v_processed := v_processed + 1;
    
    INSERT INTO tiny_orders (
      tiny_id,
      numero_pedido, 
      situacao, 
      data_criacao, 
      valor,
      raw, 
      inserted_at
    ) VALUES (
      (v_order->>'id')::bigint,
      (v_order->>'numeroPedido')::bigint,
      (v_order->>'situacao')::integer,
      (v_order->>'dataCriacao')::date,
      (v_order->>'valor')::numeric,
      v_order,
      now()
    )
    ON CONFLICT (tiny_id) DO UPDATE SET 
      situacao = (v_order->>'situacao')::integer,
      raw = v_order,
      updated_at = now();
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'processed', v_processed
  );
END;
$$ LANGUAGE plpgsql;

-- Testar a função
SELECT sync_tiny_orders_now() as resultado;
