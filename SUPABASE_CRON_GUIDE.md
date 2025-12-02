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

### Produtos (Nova migration criada)
### Produtos (pg_cron ativo)
- **Migrations**: `20251121120000_cron_sync_produtos.sql` + `20251201150000_refresh_sync_produtos_function.sql` + `20251202170000_preserve_manual_produto_fields.sql`
- **Frequência**: A cada **2 minutos**
- **Função**: `sync_produtos_from_tiny()`
- **Status**: ✅ Aplicado (preserva campos locais)

---
1. **Campos locais preservados**: Desde `20251202170000_preserve_manual_produto_fields.sql`, o `ON CONFLICT` mantém `fornecedor_codigo`, `embalagem_qtd` e `observacao_compras` já armazenados no banco, evitando que edições feitas na tela de Compras sejam apagadas.
2. **Rate Limit do Tiny**: A API do Tiny tem limite de 100 req/min
  - pg_cron faz apenas 1 request a cada 2 min = seguro
  - Ajuste `limit=100` na URL se quiser processar mais produtos por vez
3. **Estoque não é sincronizado no pg_cron**: 

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
```sql
SELECT * FROM sync_produtos_from_tiny();
```

---

## ⚙️ Ajustar Frequência

### Para rodar a cada 1 minuto (mais agressivo)
```sql
SELECT cron.unschedule('sync-produtos-supabase');
SELECT cron.schedule(
  'sync-produtos-supabase',
  '*/1 * * * *',  -- Cada 1 minuto
  'SELECT sync_produtos_from_tiny();'
);
```

### Para rodar a cada 5 minutos (mais conservador)
```sql
SELECT cron.unschedule('sync-produtos-supabase');
SELECT cron.schedule(
  'sync-produtos-supabase',
  '*/5 * * * *',  -- Cada 5 minutos
  'SELECT sync_produtos_from_tiny();'
);
```

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
| **Produtos (preço/básico)** | Supabase pg_cron | 2 minutos | Quase tempo real |
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

