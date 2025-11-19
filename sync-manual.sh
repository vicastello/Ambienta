#!/bin/bash

# Manual sync script to populate all orders with detailed fields (valorFrete, valorTotalPedido, etc)

echo "=== INICIANDO SINCRONIZAÇÃO MANUAL ==="
echo "Isto vai trazer valorFrete, valorTotalPedido, valorTotalProdutos para TODOS os pedidos"
echo ""

# Try on localhost with different ports
for PORT in 3000 3002 3003; do
  echo "Tentando porta $PORT..."
  
  RESPONSE=$(curl -s -m 60 -X GET \
    -H "Authorization: Bearer test" \
    "http://localhost:$PORT/api/tiny/sync/cron" 2>&1)
  
  if echo "$RESPONSE" | grep -q "success"; then
    echo "✓ Sincronização iniciada na porta $PORT!"
    echo ""
    echo "$RESPONSE" | jq '.'
    echo ""
    echo "✓ SUCESSO!"
    exit 0
  fi
done

echo "✗ Não consegui conectar ao servidor em nenhuma porta (3000, 3002, 3003)"
echo "Por favor, inicie o servidor com: npm run dev"
exit 1
