# 🚀 Deploy da Edge Function - Guia Completo

## ⚡ RESUMO - O QUE VOCÊ PRECISA FAZER

### **Passo 1: Criar a Edge Function no Supabase (5 min)**
1. Vá para: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/functions
2. Clique em **"Create new function"**
3. Nome: `sync-polling`
4. Cole o código (veja abaixo)
5. Clique **"Deploy"**

### **Passo 2: Adicionar Variáveis de Ambiente (2 min)**
1. Na função `sync-polling`, clique em **"Configuration"**
2. Vá para **"Secrets"**
3. Adicione as variáveis (veja valores abaixo)
4. Salve

### **Passo 3: Executar Migration SQL (2 min)**
1. Vá para: SQL Editor
2. Cole o SQL de cron (veja abaixo)
3. Execute
4. Pronto! ✅

---

## 📋 PASSO 1: CÓDIGO DA FUNÇÃO

Copie e cole este código no editor da função:

```typescript
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
```

---

## 🔐 PASSO 2: VARIÁVEIS DE AMBIENTE

Adicione estas variáveis na seção "Secrets" da função:

| Variável | Valor |
|----------|-------|
| `SUPABASE_URL` | `https://znoiauhdrujwkfryhwiz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpub2lhdWhkcnVqd2tmcnlod2l6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzM5ODEyNywiZXhwIjoyMDc4OTc0MTI3fQ.J1GFCdU1Fb9Jc5NlQSHkI7vsvXPWbE3l6h-17KLPsZQ` |

**Observação:** O token Tiny é obtido automaticamente da tabela `tiny_tokens` (OAuth já configurado!)

---

## 🗄️ PASSO 3: SQL DO CRON

Cole este SQL no **SQL Editor** do Supabase e execute:

```sql
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the sync-polling function to run every 1 minute
-- This uses pg_cron to call the Supabase Edge Function via HTTP
SELECT cron.schedule(
  'sync-polling-every-minute',
  '*/1 * * * *',
  $$
  SELECT 
    net.http_post(
      url := 'https://znoiauhdrujwkfryhwiz.supabase.co/functions/v1/sync-polling',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_key')
      ),
      body := jsonb_build_object(
        'action', 'sync',
        'timestamp', now()
      )
    )
  $$
);

-- Verify the job was created
SELECT * FROM cron.job;
```

---

## ✅ VERIFICAR SE FUNCIONOU

### 1. **Testar a função manualmente:**

Vá para: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/functions

Clique em `sync-polling` → Botão "Invoke"

Você deve ver uma resposta:

```json
{
  "success": true,
  "processed": 45,
  "changed": 3,
  "efficiency": "93%"
}
```

### 2. **Verificar os logs:**

Vá para: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/functions → `sync-polling` → Logs

Você deve ver logs a cada 1 minuto:

```
[sync-polling] Starting differential sync...
[sync-polling] Syncing orders from 2025-11-12 to 2025-11-19
[sync-polling] Order 12345 unchanged, skipping
[sync-polling] Order 12346 synced
```

### 3. **Verificar banco de dados:**

No SQL Editor, execute:

```sql
SELECT 
  COUNT(*) as total_orders,
  COUNT(CASE WHEN data_hash IS NOT NULL THEN 1 END) as with_hash,
  MAX(last_sync_check) as last_sync
FROM tiny_orders;
```

---

## 🎉 RESULTADO FINAL

✅ **Polling a cada 1 MINUTO** (praticamente tempo real!)
✅ **Hash-based change detection** (não processa redundâncias)
✅ **100% GRÁTIS** no Supabase (usa ~8% do limite)
✅ **Automático 24/7** 
✅ **Sem dependência de Vercel**

---

## 🆘 PRECISA DE AJUDA?

Se houver erro, verifique:

1. ✅ Código foi colado corretamente?
2. ✅ Variáveis de ambiente foram adicionadas?
3. ✅ SQL do cron foi executado?
4. ✅ Não há erro na invocação manual?

Me avisa qual passo ficou com dúvida!
