# 🎯 Instruções Finais - Ativar Polling de Pedidos

Sua arquitetura está **100% pronta**. Falta apenas um último passo manual para ativar!

---

## ✅ Status Atual

- ✅ Dashboard funcionando (Liquid Glass + Ambienta)
- ✅ Token Tiny autenticado
- ✅ Banco de dados configurado
- ✅ SQL de polling pronto
- ✅ Cron scheduling preparado
- ⏳ **Falta apenas:** Executar o SQL no Supabase

---

## 🚀 Escolha UMA das 3 opções abaixo:

### **OPÇÃO 1: Copiar e Colar (5 segundos) ⭐ RECOMENDADO**

1. Abra este arquivo e **copie tudo**:
   👉 [`SETUP_EFFICIENT_POLLING.sql`](./SETUP_EFFICIENT_POLLING.sql)

2. Vá para: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/sql/new

3. **Cole** (Cmd+V) e clique em **RUN**

4. ✅ Pronto! Dashboard sincroniza em 60 segundos.

---

### **OPÇÃO 2: Python Script (10 segundos)**

```bash
# 1. Instale a dependência (primeira vez):
pip install psycopg2-binary

# 2. Execute:
python3 setup_polling.py

# 3. Digite sua senha Supabase quando pedir
```

**Como conseguir a senha:**
- Vá para: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/settings/database
- Copie a senha em "Database Password"
- Cole no terminal

---

### **OPÇÃO 3: Node.js Script (10 segundos)**

```bash
# 1. Execute:
node setup-polling-execute.js

# 2. Sistema lê SETUP_EFFICIENT_POLLING.sql automaticamente
```

---

## 📊 Verificar que está funcionando

Após 60 segundos, execute no Supabase SQL Editor:

```sql
SELECT 
  COUNT(*) as total_pedidos,
  MAX(last_sync_check) as ultima_sincronizacao
FROM tiny_orders;
```

Se `ultima_sincronizacao` for recente (< 1 minuto atrás), ✅ está funcionando!

---

## 🔍 Monitorar sincronização em tempo real

```sql
-- Ver cron job ativo
SELECT jobname, schedule, command FROM cron.job 
WHERE jobname = 'sync-tiny-efficient';

-- Ver últimas execuções
SELECT jobname, start_time, return_message 
FROM cron.job_run_details 
WHERE jobname = 'sync-tiny-efficient' 
ORDER BY start_time DESC LIMIT 5;

-- Forçar sincronização agora
SELECT sync_tiny_orders_now();
```

---

## 🎯 O que acontece após setup

✅ **A cada 1 minuto:**
- Sistema chama Tiny API
- Sincroniza novos pedidos
- Detecta mudanças (SHA-256 hash)
- Atualiza banco de dados

✅ **No Dashboard (a cada 30 segundos):**
- Página auto-refresh
- Mostra pedidos novos
- Exibe última atualização

✅ **Sem precisar fazer nada:**
- Completamente automático
- Zero clicks necessários
- Funciona 24/7

---

## 🆘 Problemas?

### "Endpoint retorna 404"
→ Vercel ainda está deployando. Aguarde 2 minutos e tente novamente.
→ **Use a OPÇÃO 1** (copiar e colar) enquanto isso.

### "Conexão psycopg2 falha"
→ Verifique sua senha Supabase
→ Teste manualmente no Supabase SQL Editor (OPÇÃO 1)

### "Cron job não roda"
→ Verifique se função `sync_tiny_orders_now()` existe:
```sql
SELECT proname FROM pg_proc WHERE proname = 'sync_tiny_orders_now';
```

### "Pedidos não sincronizam"
→ Teste a função diretamente:
```sql
SELECT sync_tiny_orders_now();
```

---

## 📝 Resumo da Arquitetura

```
Tiny ERP
    ↓
[API /pedidos] ← (token OAuth)
    ↓
PostgreSQL + HTTP extension
    ↓
sync_tiny_orders_now() → SHA-256 hash comparison
    ↓
tiny_orders table (upsert automático)
    ↓
Dashboard (auto-refresh 30s)
```

**Trigger:** pg_cron a cada 1 minuto
**Rate Limit:** Nenhum problema (token é bearer)
**Downtime:** Zero (não depende de Edge Functions)

---

## ✨ Pronto!

Escolha uma opção acima e execute. Em 1-2 minutos seu dashboard estará sincronizando automaticamente.

📞 Qualquer dúvida, verifique os comentários em `SETUP_EFFICIENT_POLLING.sql`
