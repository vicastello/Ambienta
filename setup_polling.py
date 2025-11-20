#!/usr/bin/env python3
"""
Setup efficient polling in Supabase
Run: python3 setup_polling.py
"""

import subprocess
import sys
import os

# Check if psql is available
result = subprocess.run(["which", "psql"], capture_output=True)
if result.returncode != 0:
    print("❌ psql not found. Installing...")
    # Try brew
    subprocess.run(["brew", "install", "postgresql"], check=False)

# Supabase connection string
DB_URL = "postgresql://postgres:[SUPABASE_PASSWORD]@db.znoiauhdrujwkfryhwiz.supabase.co:5432/postgres"

print("⚠️  First, get your Supabase password:")
print("   1. Go to: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/settings/database")
print("   2. Copy the password from 'Database Password'")
password = input("\nEnter Supabase database password: ").strip()

DB_URL = f"postgresql://postgres:{password}@db.znoiauhdrujwkfryhwiz.supabase.co:5432/postgres"

# SQL to execute
SQL = """
CREATE EXTENSION IF NOT EXISTS http;

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

  v_response := http(('GET',
    'https://api.tiny.com.br/public-api/v3/pedidos?dataInicial=' || 
    (CURRENT_DATE - INTERVAL '7 days')::text || '&dataFinal=' || CURRENT_DATE::text,
    ARRAY[
      http_header('Authorization', 'Bearer ' || v_token),
      http_header('Accept', 'application/json')
    ]
  )::http_request);

  IF v_response.status != 200 THEN
    RETURN json_build_object('success', false, 'error', 'API returned ' || v_response.status);
  END IF;

  v_orders := (v_response.content::json ->> 'retorno')::jsonb ->> 'pedidos';

  FOR v_order IN SELECT jsonb_array_elements(v_orders)
  LOOP
    v_processed := v_processed + 1;
    INSERT INTO tiny_orders (
      numero_pedido, id_tiny, situacao, data_criacao, valor,
      raw_data, data_hash, last_sync_check
    ) VALUES (
      (v_order->>'numero')::bigint,
      (v_order->>'id')::bigint,
      v_order->>'situacao',
      v_order->>'data',
      (v_order->>'total_pedido')::numeric,
      v_order,
      encode(digest(v_order::text, 'sha256'), 'hex'),
      now()
    )
    ON CONFLICT (numero_pedido) DO UPDATE SET 
      situacao = v_order->>'situacao',
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

SELECT cron.unschedule('sync-polling-every-minute') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-polling-every-minute');
SELECT cron.unschedule('sync-tiny-direct-every-minute') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-tiny-direct-every-minute');
SELECT cron.unschedule('sync-tiny-direct-sql') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-tiny-direct-sql');

SELECT cron.schedule(
  'sync-tiny-efficient',
  '*/1 * * * *',
  'SELECT sync_tiny_orders_now();'
);

SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE '%efficient%' OR jobname LIKE '%sync%';
"""

try:
    print("\n🔄 Executing setup SQL...")
    result = subprocess.run(
        ["psql", DB_URL, "-c", SQL],
        capture_output=True,
        text=True,
        timeout=30
    )
    
    if result.returncode == 0:
        print("✅ Setup completed successfully!")
        print("\n📊 Output:")
        print(result.stdout)
    else:
        print("❌ Error executing SQL:")
        print(result.stderr)
        sys.exit(1)
        
except subprocess.TimeoutExpired:
    print("❌ Connection timeout. Check your password.")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)

print("\n✅ Polling is now active!")
print("   • Runs every 1 minute")
print("   • Dashboard updates every 30 seconds")
print("   • Check: https://gestor-tiny-qxv7irs5g-vihcastello-6133s-projects.vercel.app")
