import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Direct Tiny API sync endpoint
 * Returns immediately and processes in background
 */
export async function POST(request: NextRequest) {
  // Start background sync but respond immediately to prevent timeout
  processSync().catch(err => console.error("[sync-direct] Background error:", err));

  return NextResponse.json({
    success: true,
    message: "Sync started in background",
    timestamp: new Date().toISOString(),
  });
}

async function processSync() {
  try {
    console.log("[sync-direct] Starting background sync...");

    // Get token from database
    const { data: tokenData, error: tokenError } = await supabase
      .from("tiny_tokens")
      .select("access_token")
      .eq("id", 1)
      .single();

    if (tokenError || !tokenData?.access_token) {
      console.error("[sync-direct] Token error:", tokenError?.message || "No token");
      return;
    }

    const { access_token } = tokenData;

    // Set date range (last 7 days)
    const dataFinal = new Date().toISOString().split("T")[0];
    const dataInicial = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    console.log(`[sync-direct] Syncing from ${dataInicial} to ${dataFinal}`);

    // Call Tiny API
    const tinyUrl = `https://api.tiny.com.br/public-api/v3/pedidos?dataInicial=${dataInicial}&dataFinal=${dataFinal}`;
    const tinyResponse = await fetch(tinyUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/json",
      },
    });

    if (!tinyResponse.ok) {
      const errorText = await tinyResponse.text();
      console.error(`[sync-direct] Tiny API error: ${tinyResponse.status}`, errorText);
      return;
    }

    const tinyData = await tinyResponse.json();
    const orders = tinyData.retorno?.pedidos || [];

    console.log(`[sync-direct] Received ${orders.length} orders`);

    if (orders.length === 0) {
      return;
    }

    let processedCount = 0;
    let changedCount = 0;

    // Process each order
    for (const order of orders) {
      const numeroPedido = order.numero;
      const dataHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(order))
        .digest("hex");

      const { data: existingOrder } = await supabase
        .from("tiny_orders")
        .select("data_hash")
        .eq("numero_pedido", numeroPedido)
        .single();

      processedCount++;

      if (!existingOrder || existingOrder.data_hash !== dataHash) {
        changedCount++;

        await supabase.from("tiny_orders").upsert(
          {
            numero_pedido: numeroPedido,
            id_tiny: order.id,
            situacao: order.situacao,
            data_criacao: order.data,
            valor: parseFloat(order.total_pedido || 0),
            raw_data: order,
            data_hash: dataHash,
            last_sync_check: new Date().toISOString(),
          },
          { onConflict: "numero_pedido" }
        );
      }
    }

    console.log(
      `[sync-direct] Complete. Processed: ${processedCount}, Changed: ${changedCount}`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[sync-direct] Fatal error:", errorMessage);
  }
}
