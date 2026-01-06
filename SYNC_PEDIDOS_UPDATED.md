# Sistema de Sincronização Automática de Pedidos Atualizados

## Problema Resolvido
As situações dos pedidos no Tiny ERP mudam frequentemente (Aberta → Aprovada → Faturada → Enviada, etc.), mas não estavam sendo atualizadas automaticamente no sistema.

## Solução Implementada

### 1. **Campo `dataAtualizacao` da API Tiny**
A API Tiny v3 possui o parâmetro `dataAtualizacao` no endpoint `/pedidos` que retorna apenas pedidos que foram modificados desde uma data específica.

**Documentação API:** `GET /pedidos?dataAtualizacao=yyyy-mm-dd`

### 2. **Sync Incremental Automático**
Executa o modo incremental via `/api/tiny/sync`:
- **Endpoint**: `POST /api/tiny/sync` com `{ "mode": "incremental" }`
- **Agendamento**: Supabase pg_cron ou Hostinger Cron
- **Janela**: usa `dataAtualizacao` com checkpoint em `sync_settings`
- **Logs**: registra em `sync_logs` para auditoria

### 3. **Preservação de Dados Enriquecidos**
O sistema garante que ao atualizar um pedido:
- ✅ **Frete enriquecido** (`valor_frete > 0`) é preservado
- ✅ **Canal normalizado** (diferente de "Outros") é preservado
- ✅ **Situação** é sempre atualizada com o valor mais recente do Tiny
- ✅ Outros campos são atualizados normalmente

## Arquivos Criados/Modificados

### Novos Arquivos
1. **`src/services/tinySyncService.ts`**
   - Sync incremental usando `dataAtualizacao`
   - Atualiza checkpoint em `sync_settings`

2. **`scripts/testSyncUpdated.ts`**
   - Script de teste para validação
   - Mostra pedidos atualizados antes/depois

### Arquivos Modificados
1. **`app/api/tiny/sync/route.ts`**
   - Roteia `mode: "incremental"` para o serviço incremental

2. **`lib/tinyApi.ts`**
   - Adicionou suporte ao parâmetro `dataAtualizacao` em `listarPedidosTiny()`

3. **`lib/syncProcessor.ts`**
   - Reuso do upsert com preservação de dados enriquecidos

## Configuração

### Variáveis de Ambiente
```env
# Quantas horas atrás buscar pedidos atualizados (padrão: 6)
SYNC_UPDATED_HOURS=6

# Opcional: Secret para autenticação do cron
CRON_SECRET=seu-secret-aqui
```

### Cron Schedule (Supabase pg_cron)
```sql
SELECT cron.schedule(
  'sync_pedidos_incremental',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gestao.ambientautilidades.com.br/api/tiny/sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"mode": "incremental"}'::jsonb
  );
  $$
);
```

**Schedules disponíveis:**
- `0 */1 * * *` - A cada 1 hora
- `0 */2 * * *` - A cada 2 horas (ATUAL)
- `0 */4 * * *` - A cada 4 horas
- `*/30 * * * *` - A cada 30 minutos

## Como Usar

### 1. Teste Local
```bash
# Testar o script de sincronização
npx tsx scripts/testSyncUpdated.ts
```

### 2. Teste Manual do Endpoint
```bash
# Chamar o endpoint diretamente
curl -X POST https://gestao.ambientautilidades.com.br/api/tiny/sync \
  -H "Content-Type: application/json" \
  -d '{"mode":"incremental"}'
```

### 3. Monitorar Logs
```sql
-- Ver últimas sincronizações
SELECT 
  created_at,
  message,
  meta->>'totalProcessados' as processados,
  meta->>'totalAtualizados' as atualizados,
  meta->>'durationSeconds' as duracao
FROM sync_logs
WHERE message LIKE '%pedidos atualizados%'
ORDER BY created_at DESC
LIMIT 10;
```

## Fluxo de Execução

```
1. Cron Job Dispara (a cada 2h)
   ↓
2. Busca Token do Tiny
   ↓
3. Calcula lookback (ex: últimas 6h)
   ↓
4. Chama API: GET /pedidos?dataAtualizacao=yyyy-mm-dd
   ↓
5. Para cada página de resultados:
   - Mapeia pedidos
   - Faz upsert preservando frete/canal
   - Delay 1s (rate limit)
   ↓
6. Registra resultado em sync_logs
```

## Benefícios

### ✅ Situações Sempre Atualizadas
Os pedidos agora refletem automaticamente mudanças de status no Tiny.

### ✅ Eficiência
- Busca apenas pedidos modificados (não todos)
- Reduz carga na API
- Mais rápido que sync completo

### ✅ Segurança de Dados
- Preserva frete enriquecido manualmente
- Preserva canal normalizado
- Não perde dados valiosos

### ✅ Monitoramento
- Logs detalhados em `sync_logs`
- Métricas de performance
- Rastreamento de erros

## Troubleshooting

### Problema: Cron não está rodando
**Solução:** Verificar o job no Supabase (`cron.job`/`cron.schedule`) ou o cron configurado no hPanel da Hostinger.

### Problema: Rate limit (429)
**Solução:** Aumentar delays no código ou reduzir frequência do cron

### Problema: Dados não estão atualizando
**Solução:** 
1. Verificar logs: `SELECT * FROM sync_logs ORDER BY created_at DESC LIMIT 20`
2. Testar manualmente: `npx tsx scripts/testSyncUpdated.ts`
3. Verificar token: Endpoint `/api/tiny/auth/refresh`

### Problema: Lookback muito curto/longo
**Solução:** Ajustar `SYNC_UPDATED_HOURS` no ambiente

## Próximos Passos

### Sugeridos
1. ✅ Implementado: Sync automático de pedidos atualizados
2. ⚠️ Pendente: Adicionar autenticação ao endpoint do cron (CRON_SECRET)
3. ⚠️ Pendente: Dashboard de monitoramento de syncs
4. ⚠️ Pendente: Alertas quando sync falha repetidamente

### Opcionais
- Webhook do Tiny para sincronização em tempo real
- Retry automático em caso de falha
- Métricas de performance no Grafana/Datadog

## Referências

- **API Tiny v3:** https://erp.tiny.com.br/public-api/v3/swagger
- **Supabase pg_cron:** https://supabase.com/docs/guides/database/extensions/pg_cron
- **Código relacionado:**
  - `lib/syncProcessor.ts` - Lógica de sync com preservação
  - `lib/tinyMapping.ts` - Mapeamento de dados Tiny → DB
  - `lib/freteEnricher.ts` - Enriquecimento de frete
