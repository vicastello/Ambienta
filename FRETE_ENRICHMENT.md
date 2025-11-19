# Frete Enrichment

Este sistema enriquece automaticamente os dados de pedidos com informações de frete (taxa de envio) da API do Tiny.

## Problema Resolvido

A API do Tiny tem dois endpoints diferentes para pedidos:

1. **`/pedidos` (List Endpoint)**: Retorna lista de pedidos com campos básicos
   - `id`, `valor`, `situacao`, `dataCriacao`, etc.
   - ❌ **NÃO inclui**: `valorFrete`, `valorTotalProdutos`, `valorTotalPedido`

2. **`/pedidos/{id}` (Detail Endpoint)**: Retorna detalhes de um pedido específico
   - ✅ **Inclui**: `valorFrete`, `valorTotalProdutos`, `valorTotalPedido`
   - Mais lento (uma requisição por pedido)

### Valores de Faturamento

- **Faturamento Bruto** (`totalValor`): Incluindo frete
  - Vem de: `raw.valor` ou `raw.valorTotalPedido`
  
- **Faturamento Líquido** (`totalValorLiquido`): Sem frete (apenas produtos)
  - Vem de: `raw.valorTotalProdutos` ou `raw.valor - raw.valorFrete`
  
- **Frete Total** (`totalFreteTotal`): Soma de todos os fretes
  - Vem de: `raw.valorFrete`

## Solução Implementada

### 1. Enriquecimento Automático

Após cada sync de pedidos, o sistema automaticamente:
- Pega IDs dos pedidos sincronizados
- Faz requisições ao endpoint detalhado `/pedidos/{id}`
- Atualiza o JSON `raw` com: `valorFrete`, `valorTotalProdutos`, `valorTotalPedido`
- Tudo em background (não bloqueia o sync)

**Arquivo**: `lib/syncProcessor.ts` (linhas 348-377)

### 2. Enriquecimento Manual via API

Você pode disparar enriquecimento manual de períodos específicos:

```bash
# GET - Sincronamente
curl "http://localhost:3000/api/tiny/sync/enrich-frete?dataInicial=2025-11-01&dataFinal=2025-11-30&maxToProcess=200"

# POST - Em background (retorna imediatamente)
curl -X POST "http://localhost:3000/api/tiny/sync/enrich-frete" \
  -H "Content-Type: application/json" \
  -d '{
    "dataInicial": "2025-11-01",
    "dataFinal": "2025-11-30",
    "maxToProcess": 200
  }'
```

**Resposta**:
```json
{
  "processed": 120,
  "updated": 120,
  "failed": 0
}
```

### 3. Cálculo de Valores na Dashboard

O arquivo `app/api/tiny/dashboard/resumo/route.ts` calcula:

```typescript
function extrairValoresDoTiny(raw: any) {
  const bruto = Number(raw.valor) || 0;
  const frete = Number(raw.valorFrete) || 0;
  const liquido = bruto > 0 ? bruto - frete : 0;
  return { bruto, liquido, frete };
}
```

## Arquivos Modificados

- `lib/freteEnricher.ts` - Nova biblioteca de enriquecimento
- `app/api/tiny/sync/enrich-frete/route.ts` - Novo endpoint
- `app/api/tiny/dashboard/resumo/route.ts` - Simplificado para usar dados enriquecidos
- `lib/syncProcessor.ts` - Auto-enriquecimento após sync

## Performance

- **Enriquecimento automático**: ~200-250ms por pedido (rate limiting do Tiny)
- **Batch size default**: 150 pedidos por sync
- **Timeout**: Máximo 10s por operação de enriquecimento
- **Execução**: Background (não bloqueia respostas)

## Exemplo Real

**Período**: 01/11/2025 a 30/11/2025

```json
{
  "periodoAtual": {
    "totalPedidos": 1596,
    "totalValor": 82774.40,           // Bruto (com frete)
    "totalValorLiquido": 82570.02,   // Líquido (sem frete)  
    "totalFreteTotal": 204.38         // Frete
  }
}
```

**Cálculo de exemplo para 1 pedido**:
- `valorTotalPedido`: 27,31 (bruto com frete)
- `valorTotalProdutos`: 21,89 (líquido sem frete)
- `valorFrete`: 5,42 (calculado: 27,31 - 21,89)

## Logs

Procure por `[freteEnricher]` ou `[syncProcessor]` nos logs para acompanhar o progresso.

```
[freteEnricher] Enriquecendo 120 pedidos no período 2025-11-01 a 2025-11-30...
[freteEnricher] ✓ Pedido 942882424: frete=5.42
[freteEnricher] Concluído: 120 processados, 120 atualizados, 0 falhados
```

## Troubleshooting

**Problema**: Frete ainda mostra 0
- **Solução**: Execute a API de enriquecimento manualmente para o período desejado

**Problema**: Dashboard lento durante enriquecimento
- **Esperado**: O enriquecimento roda em background, não deve afetar dashboard
- **Verificar**: Logs para ver se está progredindo

**Problema**: Alguns pedidos falharam no enriquecimento
- **Normal**: Alguns pedidos podem não ter dados completos no Tiny
- **Verificar**: Logs detalhados para ordem específica
