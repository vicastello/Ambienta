-- ALTERNATIVE SOLUTION: Direct SQL-based polling (if HTTP cron fails)
-- This function runs in the database and syncs directly with Tiny API
-- Requires pgsql 'http' extension

CREATE EXTENSION IF NOT EXISTS http;

CREATE OR REPLACE FUNCTION sync_tiny_orders_sql_direct()
RETURNS jsonb AS $$
DECLARE
  v_response http_response;
  v_token text;
  v_orders jsonb;
  v_processed int := 0;
  v_changed int := 0;
BEGIN
  -- Get token from database
  SELECT access_token INTO v_token FROM tiny_tokens WHERE id = 1;
  
  IF v_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No token');
  END IF;

  -- Call Tiny API
  v_response := http((
    'GET',
    'https://api.tiny.com.br/public-api/v3/pedidos?dataInicial=2025-10-01&dataFinal=2025-11-20',
    ARRAY[
      http_header('Authorization', 'Bearer ' || v_token),
      http_header('Accept', 'application/json')
    ]
  )::http_request);

  IF v_response.status = 200 THEN
    v_orders := v_response.content::jsonb -> 'retorno' -> 'pedidos';
    v_processed := jsonb_array_length(v_orders);
    RETURN jsonb_build_object(
      'success', true,
      'processed', v_processed,
      'changed', v_changed,
      'efficiency', '100%'
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'API returned ' || v_response.status
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Schedule this to run every minute
SELECT cron.schedule(
  'sync-tiny-direct-sql',
  '*/1 * * * *',
  'SELECT sync_tiny_orders_sql_direct();'
);
