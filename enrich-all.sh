#!/bin/bash
# Enriquece pedidos em batches com delay, esperando completar

BASE_URL="http://localhost:3000"
DATA_INICIAL="2025-11-01"
DATA_FINAL="2025-11-19"
BATCH_SIZE=20
MAX_BATCHES=100
SLEEP_BETWEEN=5

echo "=== Iniciando enriquecimento de frete ==="
echo "Período: $DATA_INICIAL a $DATA_FINAL"
echo "Batch size: $BATCH_SIZE"
echo ""

total_success=0
total_error=0
batch=0

while [ $batch -lt $MAX_BATCHES ]; do
  batch=$((batch + 1))
  
  response=$(curl -s -X POST "$BASE_URL/api/tiny/sync/enrich-frete" \
    -H "Content-Type: application/json" \
    -d "{\"dataInicial\":\"$DATA_INICIAL\",\"dataFinal\":\"$DATA_FINAL\",\"maxToProcess\":$BATCH_SIZE,\"forceUpdate\":true}")
  
  success=$(echo "$response" | jq -r '.successCount // 0')
  error=$(echo "$response" | jq -r '.errorCount // 0')
  total=$(echo "$response" | jq -r '.totalProcessed // 0')
  
  total_success=$((total_success + success))
  total_error=$((total_error + error))
  
  echo "Batch $batch: $success sucessos, $error erros (total: $total_success sucessos)"
  
  if [ "$total" = "0" ]; then
    echo "✓ Sem mais pedidos para processar"
    break
  fi
  
  if [ "$success" = "0" ] && [ "$error" -gt "0" ]; then
    echo "⚠ Todos os pedidos falharam, aumentando delay..."
    sleep $((SLEEP_BETWEEN * 2))
  else
    sleep $SLEEP_BETWEEN
  fi
done

echo ""
echo "=== Enriquecimento Concluído ==="
echo "Total de sucessos: $total_success"
echo "Total de erros: $total_error"
