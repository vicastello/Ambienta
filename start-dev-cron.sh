#!/bin/bash

# Script para iniciar o servidor de cron em background
# Uso: ./start-dev-cron.sh

PID_FILE=".dev-cron.pid"
LOG_FILE="dev-cron.log"

# Verificar se já está rodando
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p $PID > /dev/null 2>&1; then
    echo "⚠️  Servidor de cron já está rodando (PID: $PID)"
    echo "   Para parar: ./stop-dev-cron.sh"
    exit 1
  else
    rm "$PID_FILE"
  fi
fi

echo "🚀 Iniciando servidor de cron em background..."

# Iniciar servidor em background
nohup npm run dev:cron > "$LOG_FILE" 2>&1 &
PID=$!

# Salvar PID
echo $PID > "$PID_FILE"

# Aguardar um pouco para verificar se iniciou
sleep 2

if ps -p $PID > /dev/null 2>&1; then
  echo "✅ Servidor iniciado com sucesso (PID: $PID)"
  echo "📝 Logs: tail -f $LOG_FILE"
  echo "🛑 Para parar: ./stop-dev-cron.sh"
else
  echo "❌ Erro ao iniciar servidor"
  rm "$PID_FILE"
  exit 1
fi
