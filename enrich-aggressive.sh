#!/bin/bash

# DEPRECATED: Este script foi descontinuado
# O enriquecimento agora é feito via POST /api/tiny/pedidos
# que é automático a cada 30 minutos via cron

echo "⚠️  Script descontinuado!"
echo ""
echo "O enriquecimento de frete agora é feito automaticamente via:"
echo "  - POST /api/tiny/pedidos (sincroniza todos os pedidos com frete)"
echo "  - Cron: a cada 30 minutos"
echo ""
echo "Para sincronizar manualmente, use:"
echo "  bash sync-full.sh"
exit 0

# === CÓDIGO ANTIGO (DESABILITADO) ===

#!/bin/bash

# Script otimizado para limite de 120 req/min (2 por segundo)
# Usa paralelização inteligente com delays

echo "🚀 ENRIQUECEDOR OTIMIZADO - 120 req/min"
echo "======================================="
echo ""

PORT=3000
BASE_URL="http://localhost:$PORT"

echo "📊 Iniciando enriquecimento paralelo..."
echo "   Limite: 120 req/min (2 req/seg)"
echo "   Usando 2 workers em paralelo"
echo ""

# Função para enriquecer um pedido
enrich_one() {
  RESPONSE=$(curl -s -m 10 "http://localhost:3000/api/tiny/sync/enrich-slow" 2>/dev/null)
  ENRICHED=$(echo "$RESPONSE" | jq -r '.enriched' 2>/dev/null)
  
  if [ "$ENRICHED" = "true" ]; then
    TINY_ID=$(echo "$RESPONSE" | jq -r '.tinyId' 2>/dev/null)
    FRETE=$(echo "$RESPONSE" | jq -r '.valorFrete' 2>/dev/null)
    echo "[$(date '+%H:%M:%S')] ✅ Pedido $TINY_ID: R$ $FRETE"
    return 0
  else
    MSG=$(echo "$RESPONSE" | jq -r '.message // .error' 2>/dev/null)
    if [[ "$MSG" == *"Nenhum pedido"* ]]; then
      return 1
    else
      echo "[$(date '+%H:%M:%S')] ⚠️  $MSG"
      return 2
    fi
  fi
}

export -f enrich_one

BATCH_NUM=0
TOTAL_ENRICHED=0

# Enriquecer em batches: 2 workers, 1 segundo de delay entre batches
# = 2 req/seg = 120 req/min exatamente
while true; do
  BATCH_NUM=$((BATCH_NUM+1))
  
  # Rodar 2 requisições em SEQUÊNCIA (não paralelo)
  # Para evitar que peguem o mesmo pedido
  enrich_one
  RESULT1=$?
  
  enrich_one
  RESULT2=$?
  
  # Se ambos retornaram "nenhum pedido", terminar
  if [ $RESULT1 -eq 1 ] && [ $RESULT2 -eq 1 ]; then
    echo ""
    echo "✨ TODOS OS PEDIDOS ENRIQUECIDOS!"
    echo "Total: $((BATCH_NUM*2)) requisições"
    break
  fi
  
  TOTAL_ENRICHED=$((BATCH_NUM*2))
  
  # Exatamente 1 segundo de delay = 2 req/sec = 120 req/min
  sleep 1
done

echo ""
echo "======================================="
echo "Verificando resultado no dashboard..."
echo ""
curl -s "$BASE_URL/api/tiny/dashboard/resumo?dataInicial=2025-11-01&dataFinal=2025-11-19" 2>/dev/null | jq '.periodoAtual | {totalPedidos, totalFreteTotal, totalValorLiquido, percentualEnriquecido: (.totalFreteTotal > 0)}'
