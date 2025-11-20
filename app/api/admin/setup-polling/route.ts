import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Setup endpoint - Execute efficient polling setup manually
 * GET /api/admin/setup-polling?confirm=yes
 * 
 * This endpoint cannot auto-execute raw SQL via REST API,
 * but provides instructions for manual setup.
 */
export async function GET(request: NextRequest) {
  const confirm = request.nextUrl.searchParams.get("confirm");

  if (confirm === "yes") {
    // Return the SQL that needs to be executed
    const sql = `
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
`;

    return NextResponse.json({
      success: true,
      message: "Copy the SQL below and paste in Supabase SQL Editor",
      steps: [
        "Go to: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/sql/new",
        "Paste the SQL below",
        "Click RUN",
        "Wait 60 seconds, then check dashboard",
      ],
      sql,
      dashboard: "https://gestor-tiny-qxv7irs5g-vihcastello-6133s-projects.vercel.app",
    });
  }

  return NextResponse.json({
    message: "Setup instructions",
    instructions: [
      "1. Open Supabase SQL Editor: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/sql/new",
      "2. Copy SQL from: GET /api/admin/setup-polling?confirm=yes",
      "3. Paste and RUN",
      "4. Wait 60 seconds",
      "5. Dashboard updates: https://gestor-tiny-qxv7irs5g-vihcastello-6133s-projects.vercel.app",
    ],
    links: {
      supabase_sql_editor: "https://app.supabase.com/project/znoiauhdrujwkfryhwiz/sql/new",
      setup_sql: "/api/admin/setup-polling?confirm=yes",
      dashboard: "https://gestor-tiny-qxv7irs5g-vihcastello-6133s-projects.vercel.app",
    },
  });
}
