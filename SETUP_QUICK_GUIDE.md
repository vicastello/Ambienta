# 🚀 Setup Polling - 3 Passos (5 minutos)

## Passo 1️⃣: Copiar o SQL

Abra este arquivo e **copie TUDO**:
👉 [SETUP_EFFICIENT_POLLING.sql](./SETUP_EFFICIENT_POLLING.sql)

Ou copie deste link direto:
```sql
CREATE EXTENSION IF NOT EXISTS http;
CREATE OR REPLACE FUNCTION sync_tiny_orders_now() ...
SELECT cron.schedule(...);
```

## Passo 2️⃣: Colar no Supabase

1. Abra: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/sql/new
2. Clique em "New query" (canto superior esquerdo)
3. **Cole o SQL** inteiro (Cmd+V)
4. Clique em **RUN** (canto inferior direito)

Vai aparecer uma mensagem de sucesso. ✅

## Passo 3️⃣: Verificar

Após 60 segundos, você verá pedidos no dashboard!

### Para verificar manualmente:

Execute no SQL editor:
```sql
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE '%sync%';
```

Deve aparecer: `sync-tiny-efficient | */1 * * * * | SELECT sync_tiny_orders_now();`

---

## ❓ O que faz cada comando?

| Comando | O quê |
|---------|-------|
| `CREATE EXTENSION http` | Ativa capacidade de fazer HTTP calls direto no SQL |
| `CREATE FUNCTION sync_tiny_orders_now()` | Função que chama Tiny API e sincroniza |
| `SELECT cron.schedule(...)` | Agenda para rodar a cada 1 minuto |

---

## 🔍 Monitorar Sincronização

Copie e execute no SQL editor a cada minuto:

```sql
SELECT 
  COUNT(*) as total_orders,
  MAX(last_sync_check) as ultima_sincronizacao,
  NOW() - MAX(last_sync_check) as tempo_desde_sync
FROM tiny_orders;
```

Se `tempo_desde_sync` ≤ 1 minuto, está funcionando! ✅

---

## ⚡ Testes Rápidos

### 1. Forçar uma sincronização agora:
```sql
SELECT sync_tiny_orders_now();
```

### 2. Ver logs de erros:
```sql
SELECT * FROM cron.job_run_details WHERE jobname = 'sync-tiny-efficient' ORDER BY start_time DESC LIMIT 5;
```

### 3. Desativar temporariamente:
```sql
SELECT cron.unschedule('sync-tiny-efficient');
```

### 4. Reativar:
```sql
SELECT cron.schedule('sync-tiny-efficient', '*/1 * * * *', 'SELECT sync_tiny_orders_now();');
```

---

## 🎯 Próximas Etapas

Após o setup:
- ✅ Dashboard auto-atualiza a cada 30 segundos
- ✅ Pedidos sincronizam a cada 1 minuto
- ✅ Sem mais cliques manuais necessários
- ✅ Sistema 100% automático

---

**Dúvidas?** Veja os comentários em `SETUP_EFFICIENT_POLLING.sql`
