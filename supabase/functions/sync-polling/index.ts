import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const tinyToken = Deno.env.get("TINY_ACCESS_TOKEN");
const tinyClientId = Deno.env.get("TINY_CLIENT_ID");
const tinyClientSecret = Deno.env.get("TINY_CLIENT_SECRET");

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Sync Polling Function - Runs every 1 minute
 * Smart differential polling with hash-based change detection
 * 
 * Endpoint: https://YOUR_SUPABASE_URL/functions/v1/sync-polling
 */
serve(async (req: Request) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    console.log("[sync-polling] Starting differential sync...");

    // Get current token or refresh if needed
    let accessToken = tinyToken;
    if (!accessToken) {
      // Try to get from database
      const { data: tokenData, error: tokenError } = await supabase
        .from("tiny_tokens")
        .select("access_token")
        .single();

      if (tokenError || !tokenData) {
        throw new Error("Token not available");
      }
      accessToken = tokenData.access_token;
    }

    // Fetch orders from last 7 days (recent orders only)
    const hoje = new Date();
    const dataFinal = hoje.toISOString().split("T")[0];
    const dataInicial = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    console.log(
      `[sync-polling] Syncing orders from ${dataInicial} to ${dataFinal}`
    );

    // Call Tiny API
    const tinyResponse = await fetch(
      `https://api.tiny.com.br/public-api/v3/pedidos/listar?dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=1`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (!tinyResponse.ok) {
      throw new Error(`Tiny API error: ${tinyResponse.status}`);
    }

    const tinyData = await tinyResponse.json();

    if (!tinyData.data || !Array.isArray(tinyData.data)) {
      console.log("[sync-polling] No data from Tiny API");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No data to process",
          processed: 0,
          changed: 0,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let processedCount = 0;
    let changedCount = 0;

    // Process each order
    for (const order of tinyData.data) {
      processedCount++;

      // Calculate MD5 hash of order
      const orderJson = JSON.stringify(order);
      const newHash = await hashString(orderJson);

      // Check if order exists and hash matches
      const { data: existingOrder, error: fetchError } = await supabase
        .from("tiny_orders")
        .select("data_hash")
        .eq("id_tiny", order.id)
        .single();

      if (existingOrder && existingOrder.data_hash === newHash) {
        // No changes, skip
        console.log(`[sync-polling] Order ${order.id} unchanged, skipping`);
        continue;
      }

      // Order is new or changed
      changedCount++;

      // Upsert order
      const { error: upsertError } = await supabase
        .from("tiny_orders")
        .upsert(
          {
            id_tiny: order.id,
            raw: order,
            data_hash: newHash,
            last_sync_check: new Date().toISOString(),
          },
          { onConflict: "id_tiny" }
        );

      if (upsertError) {
        console.error(`[sync-polling] Error upserting order ${order.id}:`, upsertError);
      } else {
        console.log(`[sync-polling] Order ${order.id} synced`);
      }
    }

    console.log(
      `[sync-polling] Sync complete. Processed: ${processedCount}, Changed: ${changedCount}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Sync completed",
        processed: processedCount,
        changed: changedCount,
        efficiency: `${Math.round(((processedCount - changedCount) / processedCount) * 100)}%`,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[sync-polling] Error:", error.message);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

// Helper function to hash a string (MD5)
async function hashString(str: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}
