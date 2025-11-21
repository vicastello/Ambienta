#!/bin/bash

# Script para aplicar migração via SQL Editor do Supabase

echo "📋 Instruções para aplicar a migração:"
echo ""
echo "1. Acesse o SQL Editor do Supabase:"
echo "   https://supabase.com/dashboard/project/znoiauhdrujwkfryhwiz/sql/new"
echo ""
echo "2. Cole todo o conteúdo abaixo e execute:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cat supabase/migrations/20251121120000_cron_sync_produtos.sql

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "3. Após executar, verifique se o cron foi criado em:"
echo "   https://supabase.com/dashboard/project/znoiauhdrujwkfryhwiz/database/cron-jobs"
echo ""
echo "   Você deve ver um job chamado 'sync-produtos-supabase' rodando a cada 2 minutos"
echo ""
