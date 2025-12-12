#!/bin/bash

# Script para verificar o resultado final da sincronização
# Uso: ./check-final-result.sh

echo "🔍 VERIFICANDO RESULTADO DA SINCRONIZAÇÃO NOTURNA"
echo "════════════════════════════════════════════════════════════"
echo ""

# Encontrar o log mais recente
LOG_FILE=$(ls -t /tmp/sync-overnight-*.log 2>/dev/null | head -1)

if [ -z "$LOG_FILE" ]; then
  echo "❌ Nenhum log encontrado"
  exit 1
fi

echo "📝 Log analisado: $LOG_FILE"
echo ""

# Verificar se o processo ainda está rodando
PID_FILE="/tmp/sync-overnight.pid"
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "⏳ Sincronização AINDA ESTÁ RODANDO (PID: $PID)"
    echo "💡 Use './scripts/monitor-sync.sh' para acompanhar"
    echo ""
  else
    echo "✅ Sincronização FINALIZADA"
    echo ""
  fi
fi

# Verificar se há relatório final
if grep -q "RELATÓRIO FINAL" "$LOG_FILE"; then
  echo "════════════════════════════════════════════════════════════"
  echo "📊 RELATÓRIO FINAL ENCONTRADO:"
  echo "════════════════════════════════════════════════════════════"
  # Extrair relatório final
  awk '/RELATÓRIO FINAL/,/═════════════════════════════════════════════════════════/' "$LOG_FILE" | tail -20
  echo ""
else
  echo "⚠️  Relatório final não encontrado (processo pode estar rodando ou ter sido interrompido)"
  echo ""
  echo "Últimas linhas do log:"
  tail -30 "$LOG_FILE"
  echo ""
fi

# Executar verificação via script TypeScript
echo "════════════════════════════════════════════════════════════"
echo "🔍 VERIFICANDO STATUS NO BANCO DE DADOS:"
echo "════════════════════════════════════════════════════════════"
cd "$(dirname "$0")/.."
npx tsx scripts/verify-final-status.ts
