#!/bin/bash

# Script para manter o app rodando localmente enquanto Vercel está bloqueado
# Roda sincronizações a cada 30 minutos

BASE_URL="http://localhost:3000"
LOG_FILE="logs/local-sync.log"

mkdir -p logs

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

sync_all() {
    log "=== Iniciando sincronização ==="
    
    # 1. Refresh token do Tiny (se necessário)
    log "Verificando token do Tiny..."
    curl -s -X POST "$BASE_URL/api/tiny/auth/refresh" > /dev/null 2>&1
    
    # 2. Sincronizar pedidos do Tiny
    log "Sincronizando pedidos do Tiny..."
    curl -s -X POST "$BASE_URL/api/tiny/sync" > /dev/null 2>&1
    
    # 3. Sincronizar estoque
    log "Sincronizando estoque..."
    curl -s -X POST "$BASE_URL/api/tiny/cron/estoque-round-robin" > /dev/null 2>&1
    
    # 4. Enriquecer pedidos pendentes
    log "Enriquecendo pedidos..."
    curl -s -X POST "$BASE_URL/api/tiny/sync/enrich-background" > /dev/null 2>&1
    
    # 5. Auto-link de pedidos
    log "Auto-link de pedidos..."
    curl -s -X POST "$BASE_URL/api/sync/auto-link-pending" > /dev/null 2>&1
    
    log "=== Sincronização completa ==="
    log ""
}

echo ""
echo "============================================"
echo "  MODO LOCAL - Sincronização Automática"
echo "============================================"
echo ""
echo "Este script vai sincronizar dados a cada 30 minutos."
echo "Certifique-se que 'npm run dev' está rodando!"
echo ""
echo "Logs salvos em: $LOG_FILE"
echo "Pressione Ctrl+C para parar."
echo ""

# Primeira sincronização imediata
sync_all

# Loop infinito - sincroniza a cada 30 minutos (1800 segundos)
while true; do
    sleep 1800
    sync_all
done
