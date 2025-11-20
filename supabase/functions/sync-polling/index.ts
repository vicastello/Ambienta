import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Sync Polling Function - Runs every 1 minute
 * Smart differential polling with hash-based change detection
 * ✅ Version 2.1: Token refresh support
 */
serve(async (req: Request) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    console.log("[sync-polling] Starting differential sync...");

    // Get token from database (stored via OAuth)
    const { data: tokenData, error: tokenError } = await supabase
      .from("tiny_tokens")
      .select("access_token, refresh_token, expires_at")
      .single();

    if (tokenError || !tokenData) {
      throw new Error("Token not available in database. Please complete OAuth setup first.");
    }

    let accessToken = tokenData.access_token;

    // Check if token is expired and refresh if needed
    const now = Date.now();
    if (tokenData.expires_at && now > tokenData.expires_at) {
      console.log("[sync-polling] Access token expired, attempting refresh...");
      
      const refreshResponse = await fetch(
        "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: Deno.env.get("TINY_CLIENT_ID") || "",
            client_secret: Deno.env.get("TINY_CLIENT_SECRET") || "",
            refresh_token: tokenData.refresh_token || "",
          }).toString(),
        }
      );

      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        accessToken = refreshData.access_token;
        
        // Update token in database
        const newExpiresAt = now + (refreshData.expires_in - 60) * 1000;
        await supabase
          .from("tiny_tokens")
          .update({
            access_token: refreshData.access_token,
            refresh_token: refreshData.refresh_token || tokenData.refresh_token,
            expires_at: newExpiresAt,
          })
          .eq("id", 1);

        console.log("[sync-polling] Token refreshed successfully");
      } else {
        console.warn("[sync-polling] Token refresh failed, using existing token");
      }
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
      `https://api.tiny.com.br/public-api/v3/pedidos?dataInicial=${dataInicial}&dataFinal=${dataFinal}`,
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
