#!/bin/bash

#!/bin/bash

# Script para aplicar as migrações que garantem sincronização automática de itens
# e criação de cron jobs para manter o enriquecimento contínuo.

CRON_FILE="supabase/migrations/20251122123000_cron_sync_itens_e_imagens.sql"
TRIGGER_FILE="supabase/migrations/20251122124500_trigger_auto_sync_itens.sql"

if [ ! -f "$CRON_FILE" ]; then
  echo "❌ Migration não encontrada: $CRON_FILE"
  exit 1
fi

if [ ! -f "$TRIGGER_FILE" ]; then
  echo "❌ Migration não encontrada: $TRIGGER_FILE"
  exit 1
fi

echo "📋 Instruções para aplicar via SQL Editor do Supabase:\n"
echo "1) Abra o SQL Editor do projeto:"
echo "   https://supabase.com/dashboard/project/znoiauhdrujwkfryhwiz/sql/new\n"
echo "2) Execute primeiro a migração do TRIGGER (auto sync ao inserir pedido):\n"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
cat "$TRIGGER_FILE"
echo "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
echo "3) Em seguida, execute a migração dos CRON JOBS (sync periódico/background):\n"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
cat "$CRON_FILE"
echo "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
echo "4) Verifique os cron jobs criados em:"
echo "   https://supabase.com/dashboard/project/znoiauhdrujwkfryhwiz/database/cron-jobs\n"
echo "   Você deve ver:'sync-tiny-recent-itens' (*/2 min) e 'enrich-tiny-background' (*/5 min).\n"
echo "5) Teste o trigger inserindo um pedido manualmente (ou usando a API) e confira se tiny_pedido_itens é populada.\n"
