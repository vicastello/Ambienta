# Sistema de Vinculação Automática de Pedidos

## Visão Geral

Sistema implementado para vincular automaticamente pedidos dos marketplaces (Magalu, Shopee e Mercado Livre) com pedidos do Tiny, baseado nos IDs que o próprio Tiny armazena no campo `ecommerce.numeroPedidoEcommerce`.

## Como Funciona

### Descoberta do ID

Quando o Tiny importa pedidos dos marketplaces, ele armazena o ID original do pedido no campo:

```
raw_payload.ecommerce.numeroPedidoEcommerce
```

Exemplos:
- **Shopee**: `"251209VMHJA2GV"`
- **Mercado Livre**: `"2000014212910676"`
- **Magalu**: `"LU-1493670665954586"`

### Processo de Vinculação

O serviço de auto-linking:

1. **Busca** todos os pedidos do Tiny dos últimos N dias (padrão: 90)
2. **Filtra** apenas pedidos com canal de marketplace (Shopee, Mercado Livre, Magalu)
3. **Extrai** o ID do marketplace do `raw_payload.ecommerce.numeroPedidoEcommerce`
4. **Verifica** se o pedido existe na tabela do marketplace correspondente
5. **Cria** a vinculação automática com confidence_score = 1.0 (100% de certeza)

### Statísticas da Primeira Execução

**Processamento dos últimos 90 dias:**
- ✅ Total processado: 1000 pedidos
- ✅ Já vinculados: 880 pedidos (88%)
- ⚠️ Não encontrados: 120 pedidos (12%)
- ❌ Erros: 0
- ⏱️ Tempo: 42.80s

**Motivos para "Não encontrados":**
- Pedidos do marketplace ainda não sincronizados para a base de dados
- Pedidos muito recentes que estão apenas no Tiny
- Pedidos de períodos anteriores à sincronização do marketplace

## Como Usar

### 1. Script Manual (Uma Vez)

Execute a vinculação dos últimos 90 dias:

```bash
npx tsx scripts/auto-link-orders-90d.ts
```

### 2. API Endpoint

Execute via API (útil para automações):

```bash
# Vincular todos os marketplaces (últimos 90 dias)
curl -X POST http://localhost:3000/api/reports/auto-link \
  -H "Content-Type: application/json" \
  -d '{"daysBack": 90}'

# Vincular apenas Shopee (últimos 30 dias)
curl -X POST http://localhost:3000/api/reports/auto-link \
  -H "Content-Type: application/json" \
  -d '{"marketplace": "shopee", "daysBack": 30}'
```

### 3. Interface Web

Na página **`/relatorios/vinculos`**, clique no botão:

```
⚡ Vinculação Automática (90d)
```

Isso irá:
1. Processar todos os pedidos dos últimos 90 dias
2. Vincular automaticamente os que têm match exato de ID
3. Mostrar um resumo com estatísticas

### 4. Cron Job Automático (Diário)

O sistema pode ser configurado para rodar automaticamente todos os dias:

**Endpoint:** `GET /api/admin/cron/auto-link-orders?daysBack=7`

**Configuração recomendada:**
- Executar diariamente às 2h da manhã
- Processar últimos 7 dias (para pegar pedidos recentes)
- Configurar via Vercel Cron ou similar

**Exemplo no `vercel.json`:**

```json
{
  "crons": [{
    "path": "/api/admin/cron/auto-link-orders?daysBack=7",
    "schedule": "0 2 * * *"
  }]
}
```

## Estrutura do Código

### Serviço Principal

**`src/services/autoLinkingService.ts`**

Funções principais:
- `autoLinkOrders(daysBack)` - Vincula todos os marketplaces
- `autoLinkMarketplace(marketplace, daysBack)` - Vincula marketplace específico

### APIs

**`app/api/reports/auto-link/route.ts`**
- POST para executar vinculação manual

**`app/api/admin/cron/auto-link-orders/route.ts`**
- GET para cron job automático

### Scripts

**`scripts/auto-link-orders-90d.ts`**
- Script standalone para execução manual
- Exibe estatísticas detalhadas

### Interface Web

**`app/(app)/relatorios/vinculos/page.tsx`**
- Botão de vinculação automática
- Feedback visual com estatísticas

## Lógica de Confiança

Cada vinculação automática recebe:

```typescript
{
  linked_by: 'auto-linking-service',
  confidence_score: 1.0,  // 100% de confiança
  notes: 'Vinculação automática baseada em ID do marketplace (XXX)'
}
```

**Por que 100% de confiança?**
- Match exato de ID fornecido pelo próprio Tiny
- Sem ambiguidade ou heurísticas
- Dados diretos do sistema de origem

## Monitoramento

### Logs

Durante a execução, o sistema gera logs detalhados:

```
[autoLinkOrders] Buscando pedidos do Tiny desde 2025-09-11...
[autoLinkOrders] Encontrados 1000 pedidos do Tiny para processar
[autoLinkOrders] ✓ Vinculado: shopee 251209VMHJA2GV → Tiny #24323 (ID: 205040)
[autoLinkOrders] Pedido 2512100G1SE423 (shopee) não encontrado na base
[autoLinkOrders] Pedido 2000010484419211 (mercado_livre) já vinculado
```

### Métricas

Cada execução retorna:

```typescript
{
  total_processed: number;      // Total de pedidos analisados
  total_linked: number;          // Novos vínculos criados
  total_already_linked: number;  // Já existiam
  total_not_found: number;       // Não encontrados no marketplace
  errors: string[];              // Lista de erros
  linked_orders: Array<{         // Detalhes dos vinculados
    marketplace,
    marketplace_order_id,
    tiny_order_id,
    tiny_numero_pedido
  }>;
}
```

## Fluxo Recomendado de Uso

### Setup Inicial (Uma Vez)

1. Sincronize os pedidos do Tiny (últimos 90 dias)
2. Sincronize pedidos de cada marketplace (últimos 90 dias)
3. Execute a vinculação automática inicial:
   ```bash
   npx tsx scripts/auto-link-orders-90d.ts
   ```

### Manutenção Diária (Automática)

1. Configure o cron job para rodar diariamente
2. Processa últimos 7 dias automaticamente
3. Vincula pedidos novos que chegam

### Uso Manual (Quando Necessário)

1. Após sincronizar pedidos antigos de algum marketplace
2. Para reprocessar um período específico
3. Via interface web em `/relatorios/vinculos`

## Troubleshooting

### "Não encontrados" Muito Alto

**Problema:** Muitos pedidos não encontrados (>30%)

**Possíveis causas:**
1. Pedidos do marketplace não sincronizados
2. Período muito antigo (antes da sincronização)
3. IDs diferentes entre sistemas

**Solução:**
1. Sincronize os pedidos do marketplace primeiro
2. Ajuste o `daysBack` para um período menor
3. Verifique os logs para padrões

### Erros de Vinculação

**Problema:** Erros ao criar vínculos

**Possíveis causas:**
1. Pedido do Tiny não encontrado
2. Pedido do marketplace não encontrado
3. Vínculo duplicado

**Solução:**
- Verifique os logs de erro detalhados
- O sistema ignora duplicatas automaticamente
- Verifique integridade das tabelas

### Performance Lenta

**Problema:** Execução muito lenta (>60s para 1000 pedidos)

**Possíveis causas:**
1. Banco de dados sobrecarregado
2. Muitas queries individuais
3. Conexão lenta

**Solução:**
- Execute em horários de baixo uso
- Reduza o `daysBack` para processar menos pedidos
- Considere adicionar índices adicionais

## Benefícios

✅ **Automação Total**
- Sem intervenção manual necessária
- Vinculação acontece automaticamente

✅ **Alta Precisão**
- 100% de confiança no match de IDs
- Baseado em dados do próprio Tiny

✅ **Escalável**
- Processa 1000 pedidos em ~40s
- Pode rodar diariamente sem problemas

✅ **Rastreável**
- Todos os vínculos marcados como automáticos
- Logs detalhados de cada operação

✅ **Idempotente**
- Pode rodar múltiplas vezes sem duplicar
- Detecta vínculos existentes automaticamente

## Próximos Passos Sugeridos

1. **Configurar Cron Diário**
   - Adicionar ao `vercel.json` ou sistema de cron
   - Rodar todos os dias às 2h da manhã

2. **Monitoramento**
   - Criar alertas para taxa de "não encontrados" > 30%
   - Dashboard com métricas de vinculação

3. **Melhorias Futuras**
   - Match fuzzy para pedidos sem ID exato
   - Vincular por data + valor + cliente
   - Sugestões de vínculos manuais

4. **Integração**
   - Adicionar vinculação automática após sync de marketplaces
   - Notificar quando novos vínculos são criados
