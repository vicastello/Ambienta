#!/bin/bash

# Script para parar o servidor de cron
# Uso: ./stop-dev-cron.sh

PID_FILE=".dev-cron.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "⚠️  Servidor não está rodando"
  exit 1
fi

PID=$(cat "$PID_FILE")

if ps -p $PID > /dev/null 2>&1; then
  echo "🛑 Parando servidor (PID: $PID)..."
  kill $PID
  
  # Aguardar processo terminar
  for i in {1..10}; do
    if ! ps -p $PID > /dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
  
  # Se ainda estiver rodando, força
  if ps -p $PID > /dev/null 2>&1; then
    echo "⚠️  Forçando parada..."
    kill -9 $PID
  fi
  
  rm "$PID_FILE"
  echo "✅ Servidor parado com sucesso"
else
  echo "⚠️  Processo não encontrado, limpando PID file"
  rm "$PID_FILE"
fi
