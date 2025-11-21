-- Correção da função sync_tiny_orders_efficient
-- Fix: cannot cast type record to http_request

CREATE OR REPLACE FUNCTION sync_tiny_orders_efficient()
RETURNS TABLE (
  processed_count integer,
  changed_count integer,
  last_error text,
  sync_time timestamp with time zone
) AS $$
DECLARE
  v_token text;
  v_response http_response;
  v_orders jsonb;
  v_order jsonb;
  v_processed integer := 0;
  v_changed integer := 0;
  v_data_inicial text;
  v_data_final text;
  v_order_data jsonb;
  v_data_hash text;
  v_existing_hash text;
BEGIN
  -- Get token from database
  SELECT access_token INTO v_token FROM tiny_tokens WHERE id = 1;
  
  IF v_token IS NULL THEN
    RETURN QUERY SELECT 0, 0, 'No token found'::text, now();
    RETURN;
  END IF;

  -- Set date range (last 7 days)
  v_data_final := CURRENT_DATE::text;
  v_data_inicial := (CURRENT_DATE - INTERVAL '7 days')::text;

  -- Call Tiny API via HTTP (FIXED)
  BEGIN
    v_response := http((
      'GET',
      'https://api.tiny.com.br/public-api/v3/pedidos?dataInicial=' || v_data_inicial || '&dataFinal=' || v_data_final,
      ARRAY[
        http_header('Authorization', 'Bearer ' || v_token),
        http_header('Accept', 'application/json')
      ],
      NULL,
      NULL
    )::http_request);
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 0, 0, 'HTTP error: ' || SQLERRM, now();
    RETURN;
  END;

  IF v_response.status != 200 THEN
    RETURN QUERY SELECT 0, 0, 'Tiny API returned ' || v_response.status::text, now();
    RETURN;
  END IF;

  -- Parse response
  BEGIN
    v_orders := v_response.content::jsonb -> 'itens';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 0, 0, 'JSON parsing error: ' || SQLERRM, now();
    RETURN;
  END;

  -- Process each order
  FOR v_order IN SELECT jsonb_array_elements(v_orders)
  LOOP
    v_processed := v_processed + 1;
    v_order_data := v_order;
    
    -- Create a simple hash of important fields to detect changes
    v_data_hash := md5(
      COALESCE(v_order_data->>'situacao', '') || 
      COALESCE(v_order_data->>'valor', '') || 
      COALESCE(v_order_data->>'dataAlteracao', '')
    );

    -- Check if order exists and if data changed
    SELECT md5(
      COALESCE(situacao, '') || 
      COALESCE(valor::text, '') || 
      COALESCE(raw->>'dataAlteracao', '')
    ) INTO v_existing_hash
    FROM tiny_orders 
    WHERE id_tiny = (v_order_data->>'id')::bigint;

    -- Only upsert if new or changed
    IF v_existing_hash IS NULL OR v_existing_hash != v_data_hash THEN
      INSERT INTO tiny_orders (
        id_tiny,
        numero_pedido, id_tiny, situacao, data_criacao, valor,
        cliente_nome, cliente_cpf_cnpj,
        is_enriched, raw, updated_at
      ) VALUES (
        (v_order_data->>'id')::bigint,
        (v_order_data->>'numero')::int,
        (v_order_data->>'id')::bigint,
        v_order_data->>'situacao',
        (v_order_data->>'data')::date,
        (v_order_data->>'valor')::numeric,
        v_order_data->'cliente'->>'nome',
        v_order_data->'cliente'->>'cpfCnpj',
        false,
        v_order_data,
        now()
      )
      ON CONFLICT (id_tiny) DO UPDATE SET
        situacao = EXCLUDED.situacao,
        data_criacao = v_order_data->>'data',
        valor = EXCLUDED.valor,
        cliente_nome = EXCLUDED.cliente_nome,
        cliente_cpf_cnpj = EXCLUDED.cliente_cpf_cnpj,
        raw = EXCLUDED.raw,
        updated_at = now();

      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_changed, NULL::text, now();
END;
$$ LANGUAGE plpgsql;
