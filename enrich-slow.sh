#!/bin/bash

# DEPRECATED: Este script foi descontinuado
# O enriquecimento agora é feito via POST /api/tiny/pedidos

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

# Script para enriquecer LENTAMENTE todos os pedidos
# Chama o endpoint /api/tiny/sync/enrich-slow a cada 30 segundos
# Cada chamada enriquece 1 pedido

echo "Starting slow enrichment process..."
echo "This will enrich one pedido every 30 seconds"
echo "Press Ctrl+C to stop"

count=0
success=0
enriched=0
failed=0

while true; do
  echo ""
  echo "=== Enrichment cycle $(($count + 1)) at $(date) ==="
  
  response=$(curl -s -m 15 "http://localhost:3002/api/tiny/sync/enrich-slow")
  
  success_flag=$(echo "$response" | jq -r '.success' 2>/dev/null)
  enriched_flag=$(echo "$response" | jq -r '.enriched' 2>/dev/null)
  
  if [ "$success_flag" = "true" ]; then
    if [ "$enriched_flag" = "true" ]; then
      tinyId=$(echo "$response" | jq -r '.tinyId')
      frete=$(echo "$response" | jq -r '.valorFrete')
      echo "✓ Enriched pedido $tinyId with frete: R$ $frete"
      ((enriched++))
    else
      echo "ℹ No more pedidos to enrich"
      break
    fi
  else
    error=$(echo "$response" | jq -r '.error' 2>/dev/null)
    echo "✗ Error: $error"
    ((failed++))
  fi
  
  ((count++))
  ((success++))
  
  if [ $((count % 20)) -eq 0 ]; then
    echo "Progress: $enriched enriched, $failed failed (total $count cycles)"
  fi
  
  echo "Waiting 30 seconds..."
  sleep 30
done

echo ""
echo "=== Enrichment completed ==="
echo "Total cycles: $count"
echo "Successfully enriched: $enriched pedidos"
echo "Failed: $failed"
