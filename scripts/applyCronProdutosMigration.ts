/**
 * Script para aplicar migration de cron de produtos no Supabase
 * 
 * Uso: npx tsx scripts/applyCronProdutosMigration.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Variáveis de ambiente do Supabase não configuradas");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  const migrationPath = path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20251121120000_cron_sync_produtos.sql"
  );

  if (!fs.existsSync(migrationPath)) {
    console.error("❌ Arquivo de migration não encontrado:", migrationPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, "utf-8");

  console.log("═══════════════════════════════════════════════════════");
  console.log("  APLICAR MIGRATION: Cron Sync Produtos");
  console.log("═══════════════════════════════════════════════════════\n");
  console.log("📄 Arquivo:", migrationPath);
  console.log("📏 Tamanho:", sql.length, "caracteres\n");
  
  console.log("🚀 Aplicando migration...\n");

  try {
    // Executar SQL diretamente
    const { data, error } = await supabase.rpc("query", {
      query: sql,
    });

    if (error) {
      // Tentar execução alternativa se RPC não funcionar
      console.warn("⚠️  RPC 'query' não disponível, tentando execução direta...\n");
      
      // Dividir em comandos individuais
      const commands = sql
        .split(";")
        .map((cmd) => cmd.trim())
        .filter((cmd) => cmd.length > 0 && !cmd.startsWith("--"));

      for (const command of commands) {
        console.log("Executando comando...");
        const { error: cmdError } = await supabase.rpc("query", {
          query: command + ";",
        });
        
        if (cmdError) {
          console.error("❌ Erro ao executar comando:", cmdError.message);
          console.error("Comando:", command.substring(0, 100) + "...");
          throw cmdError;
        }
      }
    }

    console.log("✅ Migration aplicada com sucesso!\n");
    
    // Verificar se o cron foi agendado
    console.log("🔍 Verificando cron agendado...\n");
    
    const { data: cronData, error: cronError } = await supabase
      .from("cron.job")
      .select("*")
      .eq("jobname", "sync-produtos-supabase");

    if (cronError) {
      console.warn("⚠️  Não foi possível verificar cron (tabela pode não estar acessível)");
    } else if (cronData && cronData.length > 0) {
      console.log("✅ Cron encontrado:");
      console.log("   Nome:", cronData[0].jobname);
      console.log("   Schedule:", cronData[0].schedule);
      console.log("   Command:", cronData[0].command);
    } else {
      console.log("⚠️  Cron não encontrado, mas migration foi aplicada.");
      console.log("   Verifique manualmente via SQL Editor:");
      console.log("   SELECT * FROM cron.job WHERE jobname = 'sync-produtos-supabase';");
    }

    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  PRÓXIMOS PASSOS");
    console.log("═══════════════════════════════════════════════════════");
    console.log("1. Aguarde 2 minutos para primeira execução");
    console.log("2. Verifique logs: SELECT * FROM cron.job_run_details");
    console.log("3. Teste manual: SELECT * FROM sync_produtos_from_tiny();");
    console.log("═══════════════════════════════════════════════════════\n");

  } catch (error: any) {
    console.error("\n❌ ERRO ao aplicar migration:", error.message);
    console.error("\n💡 SOLUÇÃO ALTERNATIVA:");
    console.error("1. Acesse: https://supabase.com/dashboard");
    console.error("2. Vá em SQL Editor");
    console.error("3. Cole o conteúdo de:");
    console.error("   supabase/migrations/20251121120000_cron_sync_produtos.sql");
    console.error("4. Clique em RUN\n");
    process.exit(1);
  }
}

applyMigration();

export {};
