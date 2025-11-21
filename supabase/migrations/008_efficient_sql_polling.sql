-- SOLUTION: Direct SQL-based Tiny API polling
-- This function runs DIRECTLY in PostgreSQL, no HTTP calls needed
-- Much faster and more reliable than Edge Functions or HTTP cron

-- Wrap unschedules so missing jobs do not break the migration
DO $$ BEGIN
  PERFORM cron.unschedule('sync-polling-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('sync-tiny-direct-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('sync-tiny-direct-sql');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Create HTTP extension if not present
CREATE EXTENSION IF NOT EXISTS http;

-- Create a more efficient sync function that:
-- 1. Gets token from database
-- 2. Calls Tiny API via PostgreSQL HTTP
-- 3. Upserts new/changed orders
-- 4. All within SQL context (no serialization overhead)

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

  -- Call Tiny API via HTTP
  BEGIN
    v_response := http(('GET',
      'https://api.tiny.com.br/public-api/v3/pedidos?dataInicial=' || v_data_inicial || '&dataFinal=' || v_data_final,
      ARRAY[
        http_header('Authorization', 'Bearer ' || v_token),
        http_header('Accept', 'application/json')
      ]
    )::http_request);
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 0, 0, 'HTTP error: ' || SQLERRM, now();
    RETURN;
  END;

  IF v_response.status != 200 THEN
    RETURN QUERY SELECT 0, 0, 'Tiny API returned ' || v_response.status::text, now();
    RETURN;
  END IF;

  BEGIN
    v_orders := v_response.content::jsonb -> 'retorno' -> 'pedidos';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 0, 0, 'JSON parsing error: ' || SQLERRM, now();
    RETURN;
  END;

  -- Process each order
  FOR v_order_data IN SELECT jsonb_array_elements(v_orders)
  LOOP
    v_processed := v_processed + 1;
    
    -- Calculate data hash
    v_data_hash := encode(digest(v_order_data::text, 'sha256'), 'hex');
    
    -- Check if order exists and has changed
    SELECT data_hash INTO v_existing_hash FROM tiny_orders 
    WHERE numero_pedido = (v_order_data->>'numero')::bigint;
    
    -- Upsert if new or changed
    IF v_existing_hash IS NULL OR v_existing_hash != v_data_hash THEN
      v_changed := v_changed + 1;
      
      INSERT INTO tiny_orders (
        numero_pedido, id_tiny, situacao, data_criacao, valor,
        raw_data, data_hash, last_sync_check
      ) VALUES (
        (v_order_data->>'numero')::bigint,
        (v_order_data->>'id')::bigint,
        v_order_data->>'situacao',
        v_order_data->>'data',
        (v_order_data->>'total_pedido')::numeric,
        v_order_data,
        v_data_hash,
        now()
      )
      ON CONFLICT (numero_pedido) DO UPDATE SET
        situacao = v_order_data->>'situacao',
        data_criacao = v_order_data->>'data',
        valor = (v_order_data->>'total_pedido')::numeric,
        raw_data = v_order_data,
        data_hash = v_data_hash,
        last_sync_check = now();
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_changed, NULL::text, now();
END;
$$ LANGUAGE plpgsql;

-- Schedule the function to run every 1 minute
SELECT cron.schedule(
  'sync-tiny-orders-sql-efficient',
  '*/1 * * * *',
  'SELECT sync_tiny_orders_efficient();'
);

DO $$
BEGIN
  IF to_regclass('public.pg_cron_logs') IS NOT NULL THEN
    INSERT INTO pg_cron_logs (cron_name, status, message, created_at)
    VALUES ('sync-tiny-orders-sql-efficient', 'scheduled', 'Efficient SQL-based sync scheduled to run every minute', now())
    ON CONFLICT (cron_name) DO UPDATE SET 
      status = 'scheduled',
      message = 'Efficient SQL-based sync scheduled to run every minute',
      created_at = now();
  END IF;
END $$;

-- Verify
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE '%efficient%' OR jobname LIKE '%sync%';
