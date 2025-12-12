#!/bin/bash

echo "=== MONITORANDO BACKFILL ==="
echo ""

# Verificar se o processo está rodando
if pgrep -f "backfill-complete-working" > /dev/null; then
    echo "✓ Backfill está RODANDO"
    echo ""
else
    echo "○ Backfill NÃO está rodando (pode ter terminado)"
    echo ""
fi

# Mostrar últimas linhas do log
echo "Últimas 30 linhas do log:"
echo "---"
tail -30 /tmp/backfill.log

echo ""
echo "---"
echo "Para ver log completo: tail -f /tmp/backfill.log"
