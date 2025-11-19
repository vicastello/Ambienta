#!/bin/bash

# ============================================================================
# SUPABASE EDGE FUNCTION SETUP - Copy & Paste Everything
# ============================================================================
#
# Este arquivo contém TODO o código pronto para você copiar e colar no 
# Supabase Dashboard. Siga os 3 passos abaixo.
#
# ============================================================================

echo "
╔════════════════════════════════════════════════════════════════════════════╗
║                   SUPABASE SETUP - COPIAR E COLAR                         ║
╚════════════════════════════════════════════════════════════════════════════╝
"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " PASSO 1: CRIAR EDGE FUNCTION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Vá para: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/functions"
echo "2. Clique em: 'Create new function'"
echo "3. Nome: sync-polling"
echo "4. Copie TODO o código abaixo e cole no editor:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cat /Users/vitorcastello/projetos/gestor-tiny/supabase/functions/sync-polling/index.ts

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "5. Clique em: 'Deploy'"
echo ""
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " PASSO 2: ADICIONAR VARIÁVEIS DE AMBIENTE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Na função 'sync-polling', clique em: 'Configuration'"
echo "2. Vá para: 'Secrets'"
echo "3. Clique em: 'Add secret'"
echo "4. Adicione APENAS essas 2 variáveis:"
echo ""
echo "   KEY: SUPABASE_URL"
echo "   VALUE: https://znoiauhdrujwkfryhwiz.supabase.co"
echo ""
echo "   KEY: SUPABASE_SERVICE_ROLE_KEY"
echo "   VALUE: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpub2lhdWhkcnVqd2tmcnlod2l6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzM5ODEyNywiZXhwIjoyMDc4OTc0MTI3fQ.J1GFCdU1Fb9Jc5NlQSHkI7vsvXPWbE3l6h-17KLPsZQ"
echo ""
echo "⚠️  O token Tiny é obtido automaticamente do banco de dados (OAuth)!"
echo ""
echo "5. Clique em: 'Save'"
echo ""
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " PASSO 3: CRIAR CRON JOB (Execute no SQL Editor)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Vá para: SQL Editor"
echo "2. Clique em: 'New query'"
echo "3. Copie TODO este código SQL:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cat << 'ENDSQL'
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the sync-polling function to run every 1 minute
-- This uses pg_cron to call the Supabase Edge Function via HTTP
SELECT cron.schedule(
  'sync-polling-every-minute',
  '*/1 * * * *',
  $$
  SELECT 
    net.http_post(
      url := 'https://znoiauhdrujwkfryhwiz.supabase.co/functions/v1/sync-polling',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_key')
      ),
      body := jsonb_build_object(
        'action', 'sync',
        'timestamp', now()
      )
    )
  $$
);

-- Verify the job was created
SELECT * FROM cron.job;
ENDSQL

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "4. Clique em: 'Run' (ou Ctrl+Enter)"
echo "5. Você deve ver uma confirmação de sucesso"
echo ""
echo ""

echo "✅ PRONTO! Sistema configurado!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " VERIFICAR SE FUNCIONOU"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Vá para a função: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/functions"
echo "2. Clique em 'sync-polling'"
echo "3. Clique em 'Invoke' (no topo direito)"
echo "4. Você deve ver uma resposta como:"
echo ""
echo '   {
      "success": true,
      "processed": 45,
      "changed": 3,
      "efficiency": "93%"
    }'
echo ""
echo "5. Verifique os logs em: 'Logs'"
echo ""
echo "Pronto! 🎉"
echo ""
