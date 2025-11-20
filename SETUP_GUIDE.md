# ⚡ SETUP EFICIENTE DE POLLING

## 🎯 Objetivo
Habilitar sincronização automática de pedidos da Tiny API a cada 1 minuto usando SQL puro (sem dependências de Edge Functions ou HTTP cache).

## 📋 Passo a Passo (2 minutos)

### 1️⃣ Abra o Supabase SQL Editor
- Link: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/sql/new
- Ou: Dashboard → SQL Editor → "New Query"

### 2️⃣ Copie TODO o código abaixo

```sql
-- Create HTTP extension for API calls
CREATE EXTENSION IF NOT EXISTS http;

-- Create the efficient polling function
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
  -- Get token from database
  SELECT access_token INTO v_token FROM tiny_tokens WHERE id = 1 LIMIT 1;
  IF v_token IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No token');
  END IF;

  -- Call Tiny API with correct endpoint
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

  -- Parse response
  v_orders := (v_response.content::json ->> 'retorno')::jsonb ->> 'pedidos';

  -- Process each order
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

-- Remove old cron jobs if they exist
SELECT cron.unschedule('sync-polling-every-minute') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-polling-every-minute');
SELECT cron.unschedule('sync-tiny-direct-every-minute') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-tiny-direct-every-minute');
SELECT cron.unschedule('sync-tiny-direct-sql') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-tiny-direct-sql');

-- Schedule the new polling function to run every 1 minute
SELECT cron.schedule(
  'sync-tiny-efficient',
  '*/1 * * * *',
  'SELECT sync_tiny_orders_now();'
);

-- Verify the job is scheduled
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE '%efficient%' OR jobname LIKE '%sync%';
```

### 3️⃣ Cole no SQL Editor e clique em "RUN"

### 4️⃣ Você verá output:
```
jobname              | schedule      | command
---------------------|-------------- |---------------------------
sync-tiny-efficient  | */1 * * * *   | SELECT sync_tiny_orders_now();
```

### 5️⃣ Aguarde 60 segundos e acesse o dashboard
- Link: https://gestor-tiny-qxv7irs5g-vihcastello-6133s-projects.vercel.app
- Os pedidos começarão a aparecer! 🎉

## ✅ Pronto!

Agora o sistema está 100% automático:
- ✅ Cron executa a cada 1 minuto
- ✅ Chama Tiny API diretamente
- ✅ Sincroniza pedidos novos/alterados
- ✅ Dashboard se atualiza em tempo real (a cada 30s)
- ✅ Zero dependência de Edge Functions ou HTTP cache

## 📊 Monitorar
Para ver se está funcionando, execute no SQL editor:
```sql
SELECT * FROM sync_tiny_orders_now();
```

Deve retornar algo como:
```json
{
  "success": true,
  "processed": 4500,
  "changed": 5
}
```

## 🐛 Troubleshooting

**Problema: "relation 'tiny_orders' does not exist"**
- Solução: Executar todas as migrations antes. Acesse:
  - Migrations → Execute pending migrations

**Problema: "No token"**
- Solução: Token não foi salvo. Faça login via OAuth primeiro:
  - Dashboard → Configurações → Conectar Tiny

**Problema: "HTTP extension not available"**
- Solução: Já vem habilitado. Se não, contacte suporte Supabase.
