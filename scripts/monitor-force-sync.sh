#!/bin/bash
# Script para monitorar o progresso da sincronização forçada

echo "🔍 Monitorando sincronização forçada..."
echo ""

while ps aux | grep -q "[t]sx scripts/force-sync-missing"; do
  clear
  echo "⏳ Sincronização em andamento..."
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  
  # Mostrar últimas linhas relevantes
  tail -30 /tmp/force-sync.log | grep -E "Lote|sucesso|falhas|itens|RESULTADO|Encontrados|VERIFICAÇÃO"
  
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "Atualizando em 30 segundos... (Ctrl+C para sair)"
  sleep 30
done

clear
echo "✅ Sincronização finalizada!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
tail -50 /tmp/force-sync.log | grep -E "Lote|sucesso|falhas|itens|RESULTADO|Encontrados|VERIFICAÇÃO"
echo ""
echo "═══════════════════════════════════════════════════════════════"
