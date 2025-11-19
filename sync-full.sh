#!/bin/bash

# Script para sincronizar TODOS os pedidos dos últimos 30 dias com valorFrete
# Usa a API POST /api/tiny/pedidos em background

BASE_URL="http://localhost:3000"
ENDPOINT="/api/tiny/pedidos"

# Período: últimos 30 dias
END_DATE=$(date +%Y-%m-%d)
START_DATE=$(date -v-30d +%Y-%m-%d)

echo "🚀 Iniciando sincronização completa de frete"
echo "   Período: $START_DATE a $END_DATE"
echo "   Endpoint: $BASE_URL$ENDPOINT"

# Fazer a requisição POST
RESPONSE=$(curl -s -X POST "$BASE_URL$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{
    \"dataInicial\": \"$START_DATE\",
    \"dataFinal\": \"$END_DATE\"
  }")

echo ""
echo "📊 Resultado:"
echo "$RESPONSE" | jq '.'

# Parse da resposta
TOTAL_PROCESSED=$(echo "$RESPONSE" | jq -r '.totalProcessed // 0')
TOTAL_SAVED=$(echo "$RESPONSE" | jq -r '.totalSaved // 0')

echo ""
if [ "$TOTAL_SAVED" -gt 0 ]; then
  echo "✅ Sincronização concluída!"
  echo "   Processados: $TOTAL_PROCESSED pedidos"
  echo "   Salvos: $TOTAL_SAVED pedidos"
else
  echo "⚠️  Nenhum pedido foi salvo. Verifique os logs do servidor."
fi
