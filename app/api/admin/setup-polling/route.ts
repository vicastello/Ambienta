import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Setup endpoint - Execute efficient polling setup
 * GET /api/admin/setup-polling
 */
export async function GET() {
  try {
    console.log("[setup-polling] Starting setup...");

    // Step 1: Create HTTP extension
    try {
      const { error: extError } = await supabase.rpc("_internal_execute_sql", {
        sql: "CREATE EXTENSION IF NOT EXISTS http;",
      });
      if (extError) console.log("[setup-polling] Extension note:", extError.message);
    } catch (e) {
      console.log("[setup-polling] Extension setup skipped (RPC not available)");
    }

    // Step 2: Unschedule old jobs
    const oldJobs = [
      "sync-polling-every-minute",
      "sync-tiny-direct-every-minute",
      "sync-tiny-direct-sql",
    ];

    for (const job of oldJobs) {
      try {
        await supabase.rpc("cron_unschedule", { job_name: job });
      } catch (e) {
        // Job might not exist, that's ok
      }
    }

    console.log("[setup-polling] Old jobs unscheduled");

    // Step 3: Create polling function via raw SQL
    const createFunctionSQL = `
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
    `;

    // Execute function creation via direct SQL query (if possible)
    try {
      const { data, error } = await supabase.from("_supabase_migrations").select().single();
      console.log("[setup-polling] Can execute migrations");
    } catch (e) {
      console.log("[setup-polling] Cannot execute migrations directly");
    }

    // Step 4: Schedule via cron.schedule
    const scheduleSQL = `
SELECT cron.schedule(
  'sync-tiny-efficient',
  '*/1 * * * *',
  'SELECT sync_tiny_orders_now();'
);
    `;

    console.log("[setup-polling] Setup SQL prepared");

    return NextResponse.json({
      success: true,
      message: "Setup prepared. Please execute the SQL directly in Supabase SQL editor.",
      instructions: {
        step1: "Go to https://app.supabase.com/project/znoiauhdrujwkfryhwiz/sql/new",
        step2: "Copy content from SETUP_EFFICIENT_POLLING.sql",
        step3: "Paste and run in SQL editor",
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[setup-polling] Error:", errorMessage);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
