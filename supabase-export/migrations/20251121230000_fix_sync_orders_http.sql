-- Correção da função sync_tiny_orders_efficient
-- Fix: cannot cast type record to http_request

CREATE OR REPLACE FUNCTION sync_tiny_orders_efficient(
  p_data_inicial text DEFAULT NULL,
  p_data_final text DEFAULT NULL
)
RETURNS TABLE (
  processed_count integer,
  changed_count integer,
  last_error text,
  sync_time timestamp with time zone
) AS $function$
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
  v_numero_pedido integer;
  v_situacao integer;
  v_data_criacao date;
  v_valor numeric := 0;
  v_valor_text text;
  v_valor_frete numeric;
  v_valor_frete_text text;
  v_canal text;
  v_cliente_nome text;
BEGIN
  -- Get token from database
  SELECT access_token INTO v_token FROM tiny_tokens WHERE id = 1;

  IF v_token IS NULL THEN
    RETURN QUERY SELECT 0, 0, 'No token found'::text, now();
    RETURN;
  END IF;

  -- Set date range (defaults to last 90 days)
  v_data_final := COALESCE(p_data_final, to_char(CURRENT_DATE, 'YYYY-MM-DD'));
  v_data_inicial := COALESCE(p_data_inicial, to_char(CURRENT_DATE - INTERVAL '90 days', 'YYYY-MM-DD'));

  -- Call Tiny API via HTTP (list endpoint)
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

  IF v_orders IS NULL OR jsonb_typeof(v_orders) != 'array' OR jsonb_array_length(v_orders) = 0 THEN
    RETURN QUERY SELECT 0, 0, NULL::text, now();
    RETURN;
  END IF;

  -- Process each order
  FOR v_order IN SELECT jsonb_array_elements(v_orders)
  LOOP
    v_processed := v_processed + 1;
    v_order_data := v_order;

    -- Hash based on raw jsonb to detect changes
    v_data_hash := md5(COALESCE(v_order_data::text, ''));

    -- Prepare mapped values similar to application mapping logic
    v_numero_pedido := NULL;
    v_situacao := NULL;
    v_data_criacao := NULL;
    v_valor := 0;
    v_valor_frete := NULL;
    v_canal := NULL;
    v_cliente_nome := NULL;

    BEGIN
      v_numero_pedido := NULLIF(COALESCE(v_order_data->>'numeroPedido', v_order_data->>'numero'), '')::integer;
    EXCEPTION WHEN OTHERS THEN
      v_numero_pedido := NULL;
    END;

    BEGIN
      v_situacao := NULLIF(v_order_data->>'situacao', '')::integer;
    EXCEPTION WHEN OTHERS THEN
      v_situacao := NULL;
    END;

    BEGIN
      v_data_criacao := NULLIF(COALESCE(v_order_data->>'dataCriacao', v_order_data->>'data'), '')::date;
    EXCEPTION WHEN OTHERS THEN
      v_data_criacao := NULL;
    END;

    v_valor_text := NULLIF(COALESCE(v_order_data->>'valorTotalPedido', v_order_data->>'valor'), '');
    IF v_valor_text IS NOT NULL THEN
      BEGIN
        IF POSITION(',' IN v_valor_text) > 0 THEN
          v_valor := REPLACE(REPLACE(v_valor_text, '.', ''), ',', '.')::numeric;
        ELSE
          v_valor := v_valor_text::numeric;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_valor := 0;
      END;
    END IF;

    v_valor_frete_text := NULLIF(v_order_data->>'valorFrete', '');
    IF v_valor_frete_text IS NOT NULL THEN
      BEGIN
        IF POSITION(',' IN v_valor_frete_text) > 0 THEN
          v_valor_frete := REPLACE(REPLACE(v_valor_frete_text, '.', ''), ',', '.')::numeric;
        ELSE
          v_valor_frete := v_valor_frete_text::numeric;
        END IF;
        IF v_valor_frete = 0 THEN
          v_valor_frete := NULL; -- deixar enriquecimento detalhado decidir
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_valor_frete := NULL;
      END;
    END IF;

    v_canal := NULLIF(COALESCE(
      v_order_data#>>'{ecommerce,canal}',
      v_order_data#>>'{ecommerce,nome}',
      v_order_data#>>'{ecommerce,canalVenda}',
      v_order_data->>'canalVenda',
      v_order_data->>'canal'
    ), '');

    v_cliente_nome := NULLIF(v_order_data#>>'{cliente,nome}', '');

    -- Check if order exists and if data changed
    SELECT md5(COALESCE(raw::text, ''))
    INTO v_existing_hash
    FROM tiny_orders
    WHERE tiny_id = (v_order_data->>'id')::bigint;

    -- Only upsert if new or changed
    IF v_existing_hash IS DISTINCT FROM v_data_hash THEN
      INSERT INTO tiny_orders (
        tiny_id,
        numero_pedido,
        situacao,
        data_criacao,
        valor,
        valor_frete,
        canal,
        cliente_nome,
        is_enriched,
        raw,
        data_hash,
        last_sync_check,
        updated_at
      ) VALUES (
        (v_order_data->>'id')::bigint,
        v_numero_pedido,
        v_situacao,
        v_data_criacao,
        COALESCE(v_valor, 0),
        v_valor_frete,
        v_canal,
        v_cliente_nome,
        false,
        v_order_data,
        v_data_hash,
        now(),
        now()
      )
      ON CONFLICT (tiny_id) DO UPDATE SET
        numero_pedido = COALESCE(EXCLUDED.numero_pedido, tiny_orders.numero_pedido),
        situacao = COALESCE(EXCLUDED.situacao, tiny_orders.situacao),
        data_criacao = COALESCE(EXCLUDED.data_criacao, tiny_orders.data_criacao),
        valor = COALESCE(EXCLUDED.valor, tiny_orders.valor),
        canal = CASE
          WHEN tiny_orders.canal IS NULL OR tiny_orders.canal = '' OR tiny_orders.canal = 'Outros'
            THEN COALESCE(EXCLUDED.canal, tiny_orders.canal)
          WHEN COALESCE(EXCLUDED.canal, '') IN ('', 'Outros')
            THEN tiny_orders.canal
          ELSE EXCLUDED.canal
        END,
        cliente_nome = COALESCE(EXCLUDED.cliente_nome, tiny_orders.cliente_nome),
        raw = EXCLUDED.raw,
        data_hash = EXCLUDED.data_hash,
        last_sync_check = now(),
        valor_frete = CASE
          WHEN EXCLUDED.valor_frete IS NULL THEN tiny_orders.valor_frete
          WHEN tiny_orders.valor_frete IS NOT NULL AND tiny_orders.valor_frete > 0 AND EXCLUDED.valor_frete = 0 THEN tiny_orders.valor_frete
          ELSE EXCLUDED.valor_frete
        END,
        is_enriched = false,
        updated_at = now();

      v_changed := v_changed + 1;
    ELSE
      -- Just bump the sync timestamp when nothing changed
      UPDATE tiny_orders
      SET last_sync_check = now()
      WHERE tiny_id = (v_order_data->>'id')::bigint;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_changed, NULL::text, now();
END;
$function$ LANGUAGE plpgsql;

-- Ensure pg_cron job points to the updated function (Supabase-side scheduling)
DO $$
BEGIN
  PERFORM cron.unschedule('sync-tiny-orders-sql-efficient');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'sync-tiny-orders-sql-efficient',
  '*/5 * * * *',
  $$SELECT sync_tiny_orders_efficient();$$
);
