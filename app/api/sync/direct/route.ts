import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Direct Tiny API sync endpoint (alternative to Edge Function)
 * Bypasses Supabase Edge Function cache issues
 * Can be called from cron or manual triggers
 */
export async function POST(request: NextRequest) {
  try {
    console.log("[sync-direct] POST received - starting sync...");

    // Get token from database
    const { data: tokenData, error: tokenError } = await supabase
      .from("tiny_tokens")
      .select("access_token, refresh_token, expires_at")
      .eq("id", 1)
      .single();

    if (tokenError || !tokenData?.access_token) {
      const errorMsg = tokenError?.message || "No token available";
      console.error("[sync-direct] Token error:", errorMsg);
      return Response.json(
        { success: false, error: errorMsg },
        { status: 401 }
      );
    }

    const { access_token, expires_at } = tokenData;

    // Set date range (last 7 days)
    const dataFinal = new Date().toISOString().split("T")[0];
    const dataInicial = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    console.log(
      `[sync-direct] Syncing from ${dataInicial} to ${dataFinal} with token ${access_token.substring(0, 20)}...`
    );

    // Call Tiny API with correct endpoint
    const tinyUrl = `https://api.tiny.com.br/public-api/v3/pedidos?dataInicial=${dataInicial}&dataFinal=${dataFinal}`;
    console.log(`[sync-direct] Calling: ${tinyUrl}`);

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
      return Response.json(
        { success: false, error: `Tiny API error: ${tinyResponse.status}`, details: errorText },
        { status: tinyResponse.status }
      );
    }

    const tinyData = await tinyResponse.json();
    console.log(`[sync-direct] Received ${tinyData.retorno?.pedidos?.length || 0} orders`);

    if (!tinyData.retorno?.pedidos) {
      console.log("[sync-direct] No orders in response");
      return Response.json({
        success: true,
        processed: 0,
        changed: 0,
        efficiency: "100%",
      });
    }

    let processedCount = 0;
    let changedCount = 0;

    // Process each order
    for (const order of tinyData.retorno.pedidos) {
      const orderId = order.id;
      const numeroPedido = order.numero;

      // Calculate hash of current order
      const dataHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(order))
        .digest("hex");

      // Get existing order from database
      const { data: existingOrder } = await supabase
        .from("tiny_orders")
        .select("data_hash")
        .eq("numero_pedido", numeroPedido)
        .single();

      processedCount++;

      // Only upsert if changed or new
      if (!existingOrder || existingOrder.data_hash !== dataHash) {
        changedCount++;

        const { error: upsertError } = await supabase
          .from("tiny_orders")
          .upsert(
            {
              numero_pedido: numeroPedido,
              id_tiny: orderId,
              situacao: order.situacao,
              data_criacao: order.data,
              valor: parseFloat(order.total_pedido || 0),
              raw_data: order,
              data_hash: dataHash,
              last_sync_check: new Date().toISOString(),
            },
            { onConflict: "numero_pedido" }
          );

        if (upsertError) {
          console.error(`[sync-direct] Error upserting order ${numeroPedido}:`, upsertError);
        } else {
          console.log(`[sync-direct] Order ${numeroPedido} synced`);
        }
      } else {
        console.log(`[sync-direct] Order ${numeroPedido} unchanged, skipping`);
      }
    }

    const efficiency = (
      ((processedCount - changedCount) / processedCount) *
      100
    ).toFixed(1);

    return Response.json({
      success: true,
      processed: processedCount,
      changed: changedCount,
      efficiency: `${efficiency}%`,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[sync-direct] Error:", errorMessage);
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
