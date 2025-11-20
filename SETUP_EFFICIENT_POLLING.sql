-- PASTE THIS DIRECTLY IN SUPABASE SQL EDITOR
-- This implements efficient SQL-based Tiny API polling

-- Step 1: Create HTTP extension
CREATE EXTENSION IF NOT EXISTS http;

-- Step 2: Create the efficient polling function
CREATE OR REPLACE FUNCTION sync_tiny_orders_now()
RETURNS json AS $$
DECLARE
  v_token text;
  v_response http_response;
  v_orders jsonb;
  v_order jsonb;
  v_processed integer := 0;
  v_changed integer := 0;
BEGIN
  SELECT access_token INTO v_token FROM tiny_tokens WHERE id = 1 LIMIT 1;
  IF v_token IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No token');
  END IF;

  SELECT * INTO v_response FROM http((
    'GET',
    'https://api.tiny.com.br/public-api/v3/pedidos?dataInicial=' || 
    (CURRENT_DATE - INTERVAL '7 days')::text || '&dataFinal=' || CURRENT_DATE::text,
    ARRAY[
      http_header('Authorization', 'Bearer ' || v_token),
      http_header('Accept', 'application/json')
    ],
    NULL,
    NULL
  )::http_request);

  IF v_response.status != 200 THEN
    RETURN json_build_object('success', false, 'error', 'API returned ' || v_response.status);
  END IF;

  -- Parse the correct structure: root level 'itens' array
  v_orders := (v_response.content::jsonb -> 'itens');

  IF v_orders IS NULL OR jsonb_array_length(v_orders) = 0 THEN
    RETURN json_build_object('success', true, 'processed', 0, 'changed', 0, 'note', 'No orders in response');
  END IF;

  FOR v_order IN SELECT jsonb_array_elements(v_orders)
  LOOP
    v_processed := v_processed + 1;
    INSERT INTO tiny_orders (
      numero_pedido, id_tiny, situacao, data_criacao, valor,
      raw_data, data_hash, last_sync_check
    ) VALUES (
      (v_order->>'numeroPedido')::bigint,
      (v_order->>'id')::bigint,
      (v_order->>'situacao')::text,
      (v_order->>'dataCriacao')::date,
      (v_order->>'valor')::numeric,
      v_order,
      encode(digest(v_order::text, 'sha256'), 'hex'),
      now()
    )
    ON CONFLICT (numero_pedido) DO UPDATE SET 
      situacao = (v_order->>'situacao')::text,
      raw_data = v_order,
      data_hash = encode(digest(v_order::text, 'sha256'), 'hex'),
      last_sync_check = now()
    WHERE tiny_orders.data_hash != encode(digest(v_order::text, 'sha256'), 'hex');
    
    IF FOUND THEN
      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'processed', v_processed,
    'changed', v_changed
  );
END;
$$ LANGUAGE plpgsql;

-- Step 3: Schedule to run every 1 minute
SELECT cron.schedule(
  'sync-tiny-efficient',
  '*/1 * * * *',
  'SELECT sync_tiny_orders_now();'
);

-- Verify
SELECT jobname, schedule FROM cron.job WHERE jobname LIKE '%sync%' OR jobname LIKE '%efficient%';
