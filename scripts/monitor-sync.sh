#!/bin/bash

# Script para monitorar a sincronização noturna
# Uso: ./monitor-sync.sh

LOG_FILE=$(ls -t /tmp/sync-overnight-*.log 2>/dev/null | head -1)
PID_FILE="/tmp/sync-overnight.pid"

if [ -z "$LOG_FILE" ]; then
  echo "❌ Nenhum log de sincronização encontrado"
  exit 1
fi

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "✅ Sincronização rodando (PID: $PID)"
  else
    echo "❌ Processo não encontrado (PID: $PID)"
  fi
else
  echo "⚠️  Arquivo PID não encontrado"
fi

echo "📝 Log: $LOG_FILE"
echo ""
echo "════════════════════════════════════════════════════════════"
echo "ÚLTIMAS 40 LINHAS DO LOG:"
echo "════════════════════════════════════════════════════════════"
tail -40 "$LOG_FILE"
echo ""
echo "════════════════════════════════════════════════════════════"
echo "RESUMO DE PROGRESSO:"
echo "════════════════════════════════════════════════════════════"
echo ""

# Extrair estatísticas do log
TOTAL_LOTES=$(grep -c "^\[Lote " "$LOG_FILE" 2>/dev/null || echo "0")
ULTIMO_LOTE=$(grep "^\[Lote " "$LOG_FILE" 2>/dev/null | tail -1 || echo "Nenhum lote processado ainda")
TOTAL_SUCESSOS=$(grep "Sucessos:" "$LOG_FILE" 2>/dev/null | tail -1 | grep -oE '[0-9]+/[0-9]+' || echo "0/0")
TOTAL_FALHAS=$(grep "Falhas:" "$LOG_FILE" 2>/dev/null | tail -1 | grep -oE '[0-9]+' || echo "0")
TOTAL_ITENS=$(grep "Itens:" "$LOG_FILE" 2>/dev/null | tail -1 | grep -oE '[0-9]+' || echo "0")
ERROS_429=$(grep -c "429" "$LOG_FILE" 2>/dev/null || echo "0")

echo "📊 Total de lotes processados: $TOTAL_LOTES"
echo "📦 Último lote: $ULTIMO_LOTE"
echo "✅ Sucessos no último lote: $TOTAL_SUCESSOS"
echo "❌ Falhas no último lote: $TOTAL_FALHAS"
echo "📊 Itens no último lote: $TOTAL_ITENS"
echo "⚠️  Total de erros 429: $ERROS_429"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "💡 Para acompanhar em tempo real: tail -f $LOG_FILE"
echo "💡 Para atualizar este resumo: ./scripts/monitor-sync.sh"
