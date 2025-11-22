#!/bin/bash

# Script para aplicar a migração de cron que garante itens/imagens em pedidos

MIGRATION_FILE="supabase/migrations/20251122123000_cron_sync_itens_e_imagens.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Migration não encontrada: $MIGRATION_FILE"
  exit 1
fi

echo "📋 Instruções para aplicar a migração via SQL Editor do Supabase:\n"
echo "1) Acesse o SQL Editor do seu projeto:" 
echo "   https://supabase.com/dashboard/project/znoiauhdrujwkfryhwiz/sql/new\n"
echo "2) Cole todo o conteúdo abaixo e execute:\n"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
cat "$MIGRATION_FILE"
echo "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
echo "3) Verifique os cron jobs criados em:" 
echo "   https://supabase.com/dashboard/project/znoiauhdrujwkfryhwiz/database/cron-jobs\n"
echo "   Você deve ver os jobs:'sync-tiny-recent-itens' (*/2 min) e 'enrich-tiny-background' (*/5 min).\n"
