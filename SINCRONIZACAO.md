# Sistema de Sincronização de Pedidos - Gestor Tiny

## 📋 Visão Geral

O sistema importa pedidos do Tiny ERP para o Supabase em **duas etapas**:

1. **Importação Rápida** - Captura pedidos com canal de venda
2. **Enriquecimento de Frete** - Busca valor do frete em background

## 🔄 Como Funciona

### Etapa 1: Importação (Rápida - ~1 segundo por 100 pedidos)

Quando você sincroniza pedidos (via API `/api/tiny/sync` ou script `syncMonth.ts`):

✅ **O que É capturado IMEDIATAMENTE:**
- `tiny_id` - ID do pedido no Tiny
- `numero_pedido` - Número do pedido
- `situacao` - Status do pedido (0-9)
- `data_criacao` - Data de criação
- `valor` - Valor total do pedido
- **`canal`** - **Canal de venda (Shopee, Mercado Livre, Magalu, etc.)** ✅
- `cliente_nome` - Nome do cliente
- `raw` - Dados completos do pedido em JSON

**Por que o canal funciona?**
A API de listagem do Tiny (`/pedidos`) retorna o campo `ecommerce.canal` que é capturado pela função `deriveCanalFromRaw()`.

❌ **O que NÃO vem na listagem:**
- `valor_frete` - A API de listagem **NÃO retorna** esse campo

### Etapa 2: Enriquecimento de Frete (Lento - ~2 segundos por pedido)

Após a importação, o sistema automaticamente:

1. Identifica pedidos sem frete (`valor_frete IS NULL OR valor_frete = 0`)
2. Busca detalhes de cada pedido individualmente via `/pedidos/{id}` 
3. Extrai o `valorFrete` e atualiza o registro

**Limitações:**
- API Tiny tem rate limit agressivo (~120 req/min)
- Cada pedido requer 1 chamada adicional
- Processo é executado em background após sync

## ⚙️ Configuração

### Variáveis de Ambiente

```bash
# Enriquecimento de frete pós-sync
FRETE_ENRICH_MAX_PASSES=5           # Quantas tentativas fazer
ENABLE_INLINE_FRETE_ENRICHMENT=false # DESABILITADO - muito lento devido a rate limits

# Normalização de canais
CHANNEL_NORMALIZE_MAX_PASSES=5
CHANNEL_NORMALIZE_BATCH=500
```

### Comportamento Padrão

**✅ Canal de Venda** → Capturado SEMPRE durante importação (100% sincronizado)

**⏳ Valor do Frete** → Enriquecido em background após importação:
- Prioriza pedidos mais recentes
- Processa em lotes de 10 pedidos
- Delay de 2s entre lotes para respeitar rate limit
- Até 5 passes para cobrir todos os pedidos

## 🚀 Como Usar

### 1. Sincronização Manual (Script)

```bash
# Sincronizar novembro de 2025
npx tsx scripts/syncMonth.ts --start=2025-11-01 --end=2025-11-30

# Sincronizar apenas hoje
npx tsx scripts/syncMonth.ts --start=2025-11-21 --end=2025-11-21
```

**O script automaticamente:**
1. Importa pedidos (com canal ✅)
2. Enriquece frete em background (até 5 passes)
3. Normaliza canais que ficaram como "Outros"

### 2. Sincronização via API

```bash
# Sincronizar período
curl -X POST http://localhost:3000/api/tiny/sync \
  -H "Content-Type: application/json" \
  -d '{"mode": "range", "dataInicial": "2025-11-01", "dataFinal": "2025-11-30"}'

# Sincronizar últimos 2 dias (rápido)
curl -X POST http://localhost:3000/api/tiny/sync \
  -H "Content-Type: application/json" \
  -d '{"mode": "recent"}'
```

### 3. Enriquecimento Manual de Frete

Se precisar forçar enriquecimento de frete para um período específico:

```bash
npx tsx - <<'TS'
const { runFreteEnrichment } = await import('./lib/freteEnricher.ts');

await runFreteEnrichment({
  startDate: '2025-11-20',
  endDate: '2025-11-21',
  limit: 100,
  batchSize: 10,
  batchDelayMs: 2000,
  newestFirst: true,
});
TS
```

#### Novo endpoint administrativo (frete + itens + canal + cidade/UF)

Agora é possível orquestrar tudo via `POST /api/admin/enrich-frete` com `mode: "range"`. O endpoint:
- Sincroniza itens dos pedidos daquela janela.
- Roda `runFreteEnrichment` invertendo a ordem (mais antigos primeiro) no intervalo.
- Normaliza canais (incluindo "Outros") e preenche cidade/UF apenas para os pedidos na janela.
- Registra logs no `sync_logs` com `meta.step = 'orders'` e `meta.janela = AAAA-MM-DD/AAAA-MM-DD`, garantindo visibilidade no calendário.

Parâmetros aceitos:

```json
{
  "mode": "range",
  "dataInicial": "YYYY-MM-DD",
  "dataFinal": "YYYY-MM-DD",
  "limit": 80,          // opcional, máximo de pedidos por passe no frete
  "batchSize": 8,       // opcional, tamanho do lote por passe
  "itensDelayMs": 800,  // opcional, delay entre requisições de itens (250-5000)
  "channelLimit": 400,  // opcional, override da busca de canais
  "cidadeLimit": 400    // opcional, override da busca de cidade/UF
}
```

Exemplos para o dia **24/11/2025**:

```bash
# Localhost
curl -X POST http://localhost:3000/api/admin/enrich-frete \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "range",
    "dataInicial": "2025-11-24",
    "dataFinal": "2025-11-24"
  }'

# Produção (Hostinger)
curl -X POST https://gestao.ambientautilidades.com.br/api/admin/enrich-frete \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "range",
    "dataInicial": "2025-11-24",
    "dataFinal": "2025-11-24"
  }'
```

> O retorno traz resumos de cada etapa (`itens`, `frete`, `canais`, `cidadeUf`) e o total de pedidos impactados. Se qualquer etapa falhar, o log correspondente aparece como `error` no calendário.

## 📊 Monitoramento

### Verificar Pedidos Sincronizados

```bash
npx tsx scripts/checkRecent.ts
```

Mostra os últimos 10 pedidos com:
- ✅ Canal (deve estar sempre preenchido)
- ⏳ Frete (pode levar alguns minutos para enrichment completar)

### Ver Logs de Sincronização

```sql
SELECT * FROM sync_jobs 
ORDER BY created_at DESC 
LIMIT 10;

SELECT * FROM sync_logs 
WHERE job_id = 'SEU_JOB_ID' 
ORDER BY created_at;
```

## 🎯 Estratégia Recomendada

### Para Importação Inicial (Histórico Grande)

```bash
# 1. Importar pedidos por mês
npx tsx scripts/syncMonth.ts --start=2025-01-01 --end=2025-01-31
npx tsx scripts/syncMonth.ts --start=2025-02-01 --end=2025-02-28
# ... etc

# 2. Deixar enriquecimento de frete rodar em background
# O script já faz isso automaticamente
```

### Para Sincronização Diária (Automática)

Configure um cron job ou use Supabase Edge Functions:

```sql
-- No Supabase, criar cron job
SELECT cron.schedule(
  'sync-tiny-daily',
  '0 2 * * *', -- Todo dia às 2h da manhã
  $$
  SELECT net.http_post(
    url := 'https://gestao.ambientautilidades.com.br/api/tiny/sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"mode": "recent", "diasRecentes": 3}'::jsonb
  );
  $$
);
```

## ❓ FAQ

**P: Por que o frete não vem junto com o pedido?**
R: A API do Tiny não retorna `valorFrete` na listagem de pedidos. É necessário buscar cada pedido individualmente, o que é muito lento devido a rate limits.

**P: Posso habilitar enriquecimento inline?**
R: Não é recomendado. Use `ENABLE_INLINE_FRETE_ENRICHMENT=true` apenas para testes. O enriquecimento inline torna a sincronização 20-30x mais lenta e frequentemente falha por rate limit.

**P: Como garantir que todos os pedidos tenham frete?**
R: Execute o script de enrichment manualmente após a importação ou aguarde o processo automático completar (pode levar 10-30 minutos para grandes volumes).

**P: E se o canal vier como "Outros"?**
R: O processo automático de normalização roda após o enriquecimento de frete e corrige canais baseado nos dados do raw.

## 🔧 Troubleshooting

### Pedidos sem Canal

Isso é raro, mas se acontecer:

```bash
npx tsx - <<'TS'
const { normalizeMissingOrderChannels } = await import('./lib/channelNormalizer.ts');
await normalizeMissingOrderChannels({ includeOutros: true, limit: 500 });
TS
```

### Pedidos sem Frete (Muitos)

Execute mais passes de enrichment:

```bash
# Editar .env.local
FRETE_ENRICH_MAX_PASSES=10

# Rodar novamente
npx tsx scripts/syncMonth.ts --start=2025-11-20 --end=2025-11-21
```

### Rate Limit 429

Aumente os delays:

```typescript
await runFreteEnrichment({
  batchSize: 5,        // Menos pedidos por vez
  batchDelayMs: 5000,  // 5 segundos entre lotes
});
```

## 📝 Conclusão

O sistema está otimizado para:
- ✅ **Importação rápida** com canal de venda sempre sincronizado
- ⏳ **Enriquecimento de frete** em background, respeitando rate limits
- 🔄 **Sincronização automática** diária para manter dados atualizados

**Canal de venda está 100% sincronizado desde a importação inicial.** ✅
**Frete é enriquecido automaticamente em background após cada sync.** ⏳
