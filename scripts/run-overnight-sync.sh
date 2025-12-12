#!/bin/bash

# Script para rodar sincronização noturna em background
# Uso: ./run-overnight-sync.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="/tmp/sync-overnight-$(date +%Y%m%d-%H%M%S).log"
PID_FILE="/tmp/sync-overnight.pid"

cd "$PROJECT_DIR"

echo "🌙 Iniciando sincronização noturna (6 horas)"
echo "📁 Diretório: $PROJECT_DIR"
echo "📝 Log: $LOG_FILE"
echo ""

# Verificar se já está rodando
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if ps -p "$OLD_PID" > /dev/null 2>&1; then
    echo "⚠️  Sincronização já está rodando (PID: $OLD_PID)"
    echo "📝 Acompanhe o log: tail -f $LOG_FILE"
    exit 1
  else
    rm "$PID_FILE"
  fi
fi

# Carregar variáveis de ambiente e rodar em background
nohup bash -c "export \$(cat .env.local | grep -v '^#' | xargs) && npx tsx scripts/sync-missing-only.ts" > "$LOG_FILE" 2>&1 &
SYNC_PID=$!

echo $SYNC_PID > "$PID_FILE"

echo "✅ Sincronização iniciada em background"
echo "🆔 PID: $SYNC_PID"
echo "📝 Log: $LOG_FILE"
echo ""
echo "📊 Para acompanhar em tempo real:"
echo "   tail -f $LOG_FILE"
echo ""
echo "🛑 Para parar:"
echo "   kill $SYNC_PID"
echo ""
echo "✅ Você pode fechar este terminal, o processo continuará rodando."
