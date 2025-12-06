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

### Pedidos (Já configurado no Supabase)
- **Migration**: `008_efficient_sql_polling.sql`
- **Frequência**: A cada **1 minuto**
- **Função**: `sync_tiny_orders_efficient()`
- **Status**: ✅ Ativo

### Produtos
- **Fluxo oficial**: rota `/api/admin/cron/sync-produtos` (passando por `lib/tinyApi.ts` e cursores `produtos_sync_cursor`).
- **Função SQL**: `sync_produtos_from_tiny()` foi aposentada e será removida pela migration `20251206120000_drop_sync_produtos_from_tiny.sql`.
- **Frequência**: seguir o cron HTTP configurado no app (atual: 2 minutos via pg_cron chamando a rota).
- **Status**: manter somente o caminho HTTP; não use SELECT direto no banco.

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

1. **Rate Limit do Tiny**: A API do Tiny tem limite de 100 req/min
   - pg_cron faz apenas 1 request a cada 2 min = seguro
   - Ajuste `limit=100` na URL se quiser processar mais produtos por vez

2. **Estoque não é sincronizado no pg_cron**: 
   - Para manter rápido, o cron SQL não busca estoque
   - Estoque é atualizado via Vercel cron (a cada 6h)
   - Para estoque mais atual, rode o script manual: `npx tsx scripts/updateProdutosEstoqueImagem.ts`

3. **Logs**: Use as tabelas `cron.job_run_details` para monitorar

---

## 🔄 Próximos Passos

1. ✅ Aplicar migration `20251121120000_cron_sync_produtos.sql`
2. ✅ Verificar execução após 2 minutos
3. ✅ Monitorar logs por 1 hora
4. ✅ Ajustar frequência conforme necessidade
5. ✅ Manter Vercel cron como backup

