#!/bin/bash

# Test script for frete enrichment feature
# Usage: bash test-frete.sh [dataInicial] [dataFinal]

BASE_URL="http://localhost:3000"
DATA_INICIAL=${1:-"2025-11-01"}
DATA_FINAL=${2:-"2025-11-30"}

echo "╔════════════════════════════════════════════╗"
echo "║     Teste de Enriquecimento de Frete      ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Step 1: Check current frete status
echo "📊 [PASSO 1] Consultando status atual da dashboard..."
echo "GET /api/tiny/dashboard/resumo?dataInicial=$DATA_INICIAL&dataFinal=$DATA_FINAL"
echo ""

RESPONSE=$(curl -s "$BASE_URL/api/tiny/dashboard/resumo?dataInicial=$DATA_INICIAL&dataFinal=$DATA_FINAL")
TOTAL_VALOR=$(echo $RESPONSE | jq '.periodoAtual.totalValor')
TOTAL_LIQUIDO=$(echo $RESPONSE | jq '.periodoAtual.totalValorLiquido')
TOTAL_FRETE=$(echo $RESPONSE | jq '.periodoAtual.totalFreteTotal')
TOTAL_PEDIDOS=$(echo $RESPONSE | jq '.periodoAtual.totalPedidos')

echo "Pedidos: $TOTAL_PEDIDOS"
echo "Bruto (com frete): R$ $(echo $TOTAL_VALOR | xargs printf "%.2f")"
echo "Líquido (sem frete): R$ $(echo $TOTAL_LIQUIDO | xargs printf "%.2f")"
echo "Frete Total: R$ $(echo $TOTAL_FRETE | xargs printf "%.2f")"
echo ""

# Step 2: Trigger enrichment
echo "🔄 [PASSO 2] Disparando enriquecimento de frete..."
echo "GET /api/tiny/sync/enrich-frete?dataInicial=$DATA_INICIAL&dataFinal=$DATA_FINAL&maxToProcess=100"
echo ""

ENRICH_RESPONSE=$(curl -s "$BASE_URL/api/tiny/sync/enrich-frete?dataInicial=$DATA_INICIAL&dataFinal=$DATA_FINAL&maxToProcess=100")
PROCESSED=$(echo $ENRICH_RESPONSE | jq '.processed')
UPDATED=$(echo $ENRICH_RESPONSE | jq '.updated')
FAILED=$(echo $ENRICH_RESPONSE | jq '.failed')

echo "Processados: $PROCESSED"
echo "Atualizados: $UPDATED"
echo "Falhados: $FAILED"
echo ""

# Step 3: Check status after enrichment
echo "📊 [PASSO 3] Consultando status após enriquecimento..."
sleep 2

RESPONSE_AFTER=$(curl -s "$BASE_URL/api/tiny/dashboard/resumo?dataInicial=$DATA_INICIAL&dataFinal=$DATA_FINAL")
TOTAL_VALOR_AFTER=$(echo $RESPONSE_AFTER | jq '.periodoAtual.totalValor')
TOTAL_LIQUIDO_AFTER=$(echo $RESPONSE_AFTER | jq '.periodoAtual.totalValorLiquido')
TOTAL_FRETE_AFTER=$(echo $RESPONSE_AFTER | jq '.periodoAtual.totalFreteTotal')

echo "Bruto (com frete): R$ $(echo $TOTAL_VALOR_AFTER | xargs printf "%.2f")"
echo "Líquido (sem frete): R$ $(echo $TOTAL_LIQUIDO_AFTER | xargs printf "%.2f")"
echo "Frete Total: R$ $(echo $TOTAL_FRETE_AFTER | xargs printf "%.2f")"
echo ""

# Step 4: Compare before/after
echo "📈 [PASSO 4] Comparação Antes/Depois"
FRETE_DIFF=$(echo "$TOTAL_FRETE_AFTER - $TOTAL_FRETE" | bc)
echo "Frete aumentou de R$ $(echo $TOTAL_FRETE | xargs printf "%.2f") para R$ $(echo $TOTAL_FRETE_AFTER | xargs printf "%.2f")"
echo "Diferença: R$ $(echo $FRETE_DIFF | xargs printf "%.2f")"
echo ""

if (( $(echo "$TOTAL_FRETE_AFTER > $TOTAL_FRETE" | bc -l) )); then
  echo "✅ SUCESSO! Frete foi enriquecido com sucesso!"
else
  echo "⚠️  AVISO: Frete não aumentou após enriquecimento"
  echo "    Possível que já estava enriquecido ou não há dados disponíveis"
fi
echo ""

echo "╔════════════════════════════════════════════╗"
echo "║              Teste Concluído               ║"
echo "╚════════════════════════════════════════════╝"
