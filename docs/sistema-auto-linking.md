# Sistema de Vinculação Automática de Pedidos

## Visão Geral

Sistema completo para vincular automaticamente pedidos dos marketplaces (Shopee, Magalu, Mercado Livre) com pedidos do Tiny ERP.

## Componentes

### 1. API de Auto-Linking
**Endpoint:** `/api/sync/auto-link-pending`

**Função:** Processa pedidos dos últimos N dias que ainda não têm vínculo e tenta criar o vínculo automaticamente.

**Parâmetros:**
```json
{
  "daysBack": 7  // Processar pedidos dos últimos 7 dias (padrão)
}
```

**Lógica:**
1. Busca pedidos do Tiny dos últimos N dias que são de marketplace (canais: Shopee, Magalu, Mercado Livre)
2. Para cada pedido:
   - Verifica se já tem vínculo (pula se sim)
   - Extrai o ID do pedido do marketplace do campo `numero_pedido_ecommerce` ou `raw_payload.ecommerce.numeroPedidoEcommerce`
   - Determina qual marketplace baseado no canal
   - Verifica se o pedido existe no marketplace correspondente
   - Se existir, cria o vínculo automaticamente
   - Se não existir, marca como pendente (aguarda o pedido chegar no marketplace)

**Resposta:**
```json
{
  "total_processed": 100,
  "total_linked": 25,
  "total_already_linked": 70,
  "total_pending": 5,
  "errors": []
}
```

### 2. Cron Job (pg_cron)
**Arquivo:** `supabase/migrations/20251215120000_auto_link_pending_orders_cron.sql`

**Agendamento:** A cada hora, no minuto 15 (15 * * * *)

**Função:** Chama a API `/api/sync/auto-link-pending` automaticamente via HTTP

**Logs:** Registra execuções na tabela `sync_logs`

## Fluxo Completo

### Cenário 1: Pedido já existe em ambos os sistemas
```
1. Pedido criado no Marketplace → sincronizado para tabela marketplace_orders
2. Pedido criado no Tiny → sincronizado para tabela tiny_orders
3. Cron job roda (a cada hora)
4. API detecta que ambos existem
5. Vínculo criado automaticamente em marketplace_order_links
```

### Cenário 2: Pedido existe no Tiny, mas não no Marketplace ainda
```
1. Pedido criado no Tiny → sincronizado para tabela tiny_orders
2. Cron job roda (a cada hora)
3. API verifica, não encontra pedido no marketplace
4. Marca como "pendente" (não cria vínculo ainda)
5. Marketplace sincroniza o pedido → tabela marketplace_orders
6. Próxima execução do cron (1 hora depois)
7. API detecta que ambos existem agora
8. Vínculo criado automaticamente
```

### Cenário 3: Pedido existe no Marketplace, mas não no Tiny ainda
```
1. Pedido criado no Marketplace → sincronizado para tabela marketplace_orders
2. Tiny cria o pedido → sincronizado para tabela tiny_orders
3. Próxima execução do cron (a cada hora)
4. API detecta que ambos existem
5. Vínculo criado automaticamente
```

## Tabelas Envolvidas

### marketplace_order_links
Armazena os vínculos entre pedidos:
```sql
id                   BIGSERIAL PRIMARY KEY
marketplace          VARCHAR(50)  -- 'magalu', 'shopee', 'mercado_livre'
marketplace_order_id TEXT
tiny_order_id        BIGINT
linked_at            TIMESTAMPTZ
linked_by            TEXT         -- 'auto-link-api', 'manual', etc
confidence_score     NUMERIC(3,2) -- 1.0 para match exato
notes                TEXT
```

### sync_logs
Armazena logs das execuções:
```sql
job_id    TEXT
level     TEXT         -- 'info', 'error', 'warning'
message   TEXT
meta      JSONB
timestamp TIMESTAMPTZ
```

## Monitoramento

### Verificar Status Atual
```bash
npx tsx scripts/check-links-status.ts
```

Mostra:
- Total de vínculos criados
- Distribuição por marketplace
- Status de pedidos recentes

### Verificar Pedidos Pendentes
```bash
npx tsx scripts/check-orders-without-items-nov.ts
```

Mostra:
- Pedidos sem itens desde 01/11/2025
- Pedidos sem vínculos
- Status de sincronização

### Logs do Cron Job
```sql
SELECT * FROM sync_logs
WHERE message LIKE '%auto_link%'
ORDER BY timestamp DESC
LIMIT 10;
```

## Execução Manual

Para forçar uma vinculação imediata (sem aguardar o cron):

```bash
curl -X POST "https://gestao.ambientautilidades.com.br/api/sync/auto-link-pending" \
  -H "Content-Type: application/json" \
  -d '{"daysBack": 7}'
```

Ou via script:
```bash
npx tsx scripts/auto-link-from-nov.ts
```

### Packs do Mercado Livre
- Use `npx tsx scripts/meli-link-pack-orders.ts` para garantir que todos os pedidos filhos de um `pack_id` fiquem vinculados ao mesmo pedido do Tiny (evita pedidos “irmãos” sem link).
- Se houver diferenças de valores por duplicidade de itens, execute `npx tsx scripts/cleanup-meli-items.ts` para remover duplicatas em `meli_order_items` (chave `(meli_order_id, sku, unit_price)`).

## Métricas Atuais

### Status da Vinculação (15/12/2024)
- **Total de vínculos:** 3.997
  - Shopee: 820
  - Magalu: 40
  - Mercado Livre: 140

### Pedidos Sem Itens
- **Total desde 01/11/2025:** 3 (0.3%)
- Todos serão sincronizados automaticamente

### Taxa de Sucesso
- **Pedidos vinculados:** 99.7%
- **Pedidos com itens:** 99.7%

## Manutenção

### Adicionar Novo Marketplace
1. Adicionar lógica de detecção em `getMarketplaceFromCanal()`
2. Adicionar verificação de existência no bloco de validação
3. Atualizar constraint na tabela: `CHECK (marketplace IN (...))`

### Ajustar Frequência do Cron
Editar migration e re-aplicar:
```sql
-- De 1 em 1 hora para a cada 30 minutos:
'*/30 * * * *'  -- A cada 30 minutos
'*/15 * * * *'  -- A cada 15 minutos
'0 * * * *'     -- A cada hora (no minuto 0)
```

### Troubleshooting

**Problema:** Vínculos não estão sendo criados
1. Verificar se o cron job está rodando: `SELECT * FROM cron.job WHERE jobname = 'auto_link_pending_orders_hourly'`
2. Verificar logs de erro: `SELECT * FROM sync_logs WHERE level = 'error' ORDER BY timestamp DESC`
3. Testar API manualmente: `curl -X POST .../api/sync/auto-link-pending`

**Problema:** Pedidos não são encontrados
1. Verificar se campo `numero_pedido_ecommerce` está preenchido no Tiny
2. Verificar se `raw_payload.ecommerce.numeroPedidoEcommerce` existe
3. Verificar se pedido foi sincronizado do marketplace

**Problema:** Erros de timeout
1. Reduzir `daysBack` para processar menos pedidos por vez
2. Aumentar timeout na migration (padrão: 120000ms)
3. Verificar performance do banco de dados

## Próximos Passos

- [ ] Dashboard para visualizar status de vinculação
- [ ] Alertas para pedidos não vinculados há mais de 24h
- [ ] Retry automático para erros temporários
- [ ] Suporte para vinculação retroativa (pedidos antigos)
- [ ] API para vinculação manual com interface UI
