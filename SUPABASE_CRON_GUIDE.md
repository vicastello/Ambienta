# Guia: Sincronização Automática com Supabase pg_cron

## 🎯 Diferenças entre Vercel Cron vs Supabase pg_cron

### Vercel Cron (Atual - Limitado)
- ❌ **Limite**: 20 execuções/dia por cron (plano grátis)
- ❌ **Frequência mínima**: Prática (~1 hora)
- ✅ **Vantagem**: Fácil de configurar no `vercel.json`
- 📝 **Uso**: Tarefas menos frequentes (refresh token, backups)

### Supabase pg_cron (Recomendado)
- ✅ **Sem limites** de execução
- ✅ **Alta frequência**: Pode rodar a cada 1 minuto
- ✅ **Performance**: Executa direto no PostgreSQL (sem HTTP overhead)
- ✅ **Confiabilidade**: Não depende de endpoints externos
- 📝 **Uso**: Sincronização contínua de dados

---

## 📊 Configuração Atual

### Pedidos
- **Fluxo**: pg_cron chama `/api/admin/cron/run-sync` (job `tiny_sync_every_15min` na migration `20251128120000_cron_run_tiny_sync.sql`). Esse endpoint enfileira pedidos recentes, roda enriquecimento e normalização.
- **Status**: ativo. Ajuste a frequência alterando o cron no banco.

### Produtos
- **Fluxo oficial**: HTTP via `/api/admin/sync/produtos` (ou `callInternalJson` em `/api/admin/cron/run-sync`), sempre passando por `lib/tinyApi.ts` + `tinyUsageLogger`.
- **SQL legacy**: `sync_produtos_from_tiny()` foi aposentada (migration `20251206120000_drop_sync_produtos_from_tiny.sql`); o script `scripts/applyViaSql.ts` está bloqueado por padrão.
- **Frequência recomendada**: poucas vezes ao dia (ou manual), com `limit` baixo (10–40) e `workers=1`. Rate limiter interno está em ~90 req/min (estoque-only ~110 req/min) para não desperdiçar quota do Tiny em `/produtos`.

### Opção 1: Via Supabase Dashboard (Recomendado)
1. Acesse: https://supabase.com/dashboard
4. **Logs**: Use as tabelas `cron.job_run_details` para monitorar
3. Vá em **SQL Editor**
4. Cole o conteúdo de `supabase/migrations/20251121120000_cron_sync_produtos.sql`
5. Clique em **Run**

### Opção 2: Via CLI do Supabase
```bash
# Instalar Supabase CLI (se ainda não tem)
npm install -g supabase

# Login
supabase login

# Linkar projeto
supabase link --project-ref znoiauhdrujwkfryhwiz

# Aplicar migrations pendentes
supabase db push
```

### Opção 3: Script TypeScript
```bash
npx tsx scripts/applyMigration.ts supabase/migrations/20251121120000_cron_sync_produtos.sql
```

---

## 🔍 Verificar se está Funcionando

### Ver crons agendados
```sql
SELECT * FROM cron.job;
```

### Ver histórico de execuções
```sql
SELECT * FROM cron.job_run_details 
WHERE jobname = 'sync-produtos-supabase'
ORDER BY start_time DESC 
LIMIT 10;
```

### Executar manualmente para testar
- Para produtos, use as rotas HTTP (`/api/admin/sync/produtos` ou `/api/admin/cron/sync-produtos`) em vez de chamadas SQL.

---

## ⚙️ Ajustar Frequência

### Ajustar frequência
- Ajuste o cron que chama `/api/admin/cron/sync-produtos` no banco (pg_cron) alterando a migration correspondente; não use mais `SELECT sync_produtos_from_tiny();`.

---

## 📝 Manter Vercel Cron para Redundância

Recomendo **manter** o Vercel cron como backup:

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/admin/cron/sync-produtos",
      "schedule": "0 */6 * * *"  // Backup a cada 6 horas
    }
  ]
}
```

---

## 🎯 Configuração Recomendada Final

| Recurso | Método | Frequência | Objetivo |
|---------|--------|------------|----------|
| **Pedidos** | Supabase pg_cron | 1 minuto | Tempo real |
| **Produtos (preço/básico)** | App API (pg_cron → `/api/admin/cron/sync-produtos`) | 2 minutos | Quase tempo real |
| **Produtos (estoque/imagem)** | Vercel cron | 6 horas | Backup + dados pesados |
| **Token refresh** | Vercel cron | 6 horas | Manutenção |

---

## ⚠️ Observações Importantes

1. **Rate Limit do Tiny (~120 req/min)**: o catálogo usa rate limiter interno (~90 req/min ou 110 em estoque-only). Evite crons agressivos em `/produtos`; prefira execuções poucas vezes ao dia.

2. **Estoque**: o fluxo recomendado é o round-robin HTTP `/api/tiny/cron/estoque-round-robin` (a cada 5 min) com batch padrão 200 e delay 450ms/req + 3s em 429. Não use funções SQL com http() para consultar Tiny.

3. **Logs**: monitore `tiny_api_usage` para ver contexts/endpoints/429 e `cron.job_run_details` para histórico do pg_cron.

---

## 🔄 Próximos Passos

1. ✅ Aplicar migration `20251121120000_cron_sync_produtos.sql`
2. ✅ Verificar execução após 2 minutos
3. ✅ Monitorar logs por 1 hora
4. ✅ Ajustar frequência conforme necessidade
5. ✅ Manter Vercel cron como backup

