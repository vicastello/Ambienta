# Supabase Sync Polling Setup

## 📋 O que foi criado

### 1. **Edge Function**: `sync-polling`
- Local: `supabase/functions/sync-polling/index.ts`
- Roda a cada 1 minuto (pode ajustar)
- Hash-based change detection
- Sincroniza apenas últimos 7 dias
- Atualiza apenas pedidos que mudaram
- **GRÁTIS no plano Supabase**

### 2. **Migration**: `004_setup_polling_cron.sql`
- Configura cron job no Supabase
- Executa função a cada 1 minuto
- Automático 24/7

---

## 🚀 Como Ativar

### Passo 1: Deploy da Edge Function

Você tem 2 opções:

#### **Opção A: Via Supabase CLI (Recomendado)**

```bash
# Se não tem Supabase CLI instalado:
npm install -g supabase

# Login no Supabase
supabase login

# Link ao seu projeto
supabase link --project-ref znoiauhdrujwkfryhwiz

# Deploy a function
supabase functions deploy sync-polling --no-verify-jwt
```

#### **Opção B: Criar manualmente no Dashboard**

1. Vá para: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/functions
2. Clique em "Create a new function"
3. Nome: `sync-polling`
4. Copie o código de `supabase/functions/sync-polling/index.ts`
5. Cole no editor
6. Clique "Deploy"

---

### Passo 2: Configurar Variáveis de Ambiente

No Supabase Dashboard:

1. Vá para: Settings → Edge Functions
2. Clique em `sync-polling`
3. Vá para "Environment Variables"
4. Adicione:

```
SUPABASE_URL=https://znoiauhdrujwkfryhwiz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[SUA_SERVICE_ROLE_KEY]
TINY_ACCESS_TOKEN=[TINY_TOKEN_ATUAL]
TINY_CLIENT_ID=tiny-api-96c52ae7713211e99e3d9fd50ee4385d928437a7-1763324548
TINY_CLIENT_SECRET=vTDeowXckMitwa9brXA2w8CX64m9Axdh
```

---

### Passo 3: Executar Migration (Setup Cron)

No Supabase Dashboard:

1. Vá para: SQL Editor
2. Crie uma nova query
3. Cole o conteúdo de: `supabase/migrations/004_setup_polling_cron.sql`
4. Execute

Você verá uma mensagem confirmando que o cron foi criado.

---

## ✅ Verificar se Está Funcionando

### 1. Testar a Function Manualmente

No Supabase Dashboard → Functions → `sync-polling` → Clique em "Invoke"

Você deve ver uma resposta como:

```json
{
  "success": true,
  "processed": 45,
  "changed": 3,
  "efficiency": "93%"
}
```

### 2. Verificar Logs

Dashboard → Functions → `sync-polling` → Logs

Você deve ver logs a cada 1 minuto:

```
[sync-polling] Starting differential sync...
[sync-polling] Syncing orders from 2025-11-12 to 2025-11-19
[sync-polling] Order 12345 unchanged, skipping
[sync-polling] Order 12346 synced
```

### 3. Verificar Banco de Dados

Execute no SQL Editor:

```sql
SELECT 
  COUNT(*) as total_orders,
  COUNT(CASE WHEN data_hash IS NOT NULL THEN 1 END) as with_hash,
  MAX(last_sync_check) as last_sync
FROM tiny_orders;
```

---

## 🎯 Resultado Final

✅ **Polling automático a cada 1 minuto**
✅ **Hash-based change detection**
✅ **100% grátis no Supabase**
✅ **Praticamente tempo real**
✅ **Sem dependência do Vercel**
✅ **Usa apenas ~8% do limite gratuito**

---

## ⚙️ Ajustes Futuros

Se quiser mudar o intervalo:

### Mudar para 5 minutos:
No arquivo `supabase/migrations/004_setup_polling_cron.sql`, mude:
```sql
'*/1 * * * *',  -- a cada 1 minuto
```
para:
```sql
'*/5 * * * *',  -- a cada 5 minutos
```

### Mudar para 30 minutos:
```sql
'*/30 * * * *',  -- a cada 30 minutos
```

---

## 🆘 Troubleshooting

### "Function not found"
- Certifique-se que fez deploy com `supabase functions deploy`
- Verifique se aparece em: Dashboard → Functions

### "Unauthorized"
- Verifique se as variáveis de ambiente estão configuradas
- Teste a function manualmente primeiro

### "No data to process"
- Pode ser que não haja pedidos no período
- Verifique em: `SELECT * FROM tiny_orders LIMIT 5;`

---

## 📊 Performance

| Métrica | Valor |
|---------|-------|
| Intervalo | 1 minuto |
| Chamadas/mês | ~43.200 |
| Limite gratuito | 500.000 |
| Uso | 8,6% |
| **Custo** | **GRÁTIS** |

---

**Pronto! Seu sistema agora tem polling automático a cada 1 minuto, 100% grátis no Supabase!** 🚀
