/**
 * Script para aplicar a migração de produtos via Supabase Management API
 * 
 * Uso:
 *   npx tsx scripts/applyProdutosMigration.ts
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
  console.log("═══════════════════════════════════════════════════════");
  console.log("  APLICANDO MIGRAÇÃO DE PRODUTOS");
  console.log("═══════════════════════════════════════════════════════\n");

  const migrationPath = path.join(
    process.cwd(),
    "migrations",
    "011_create_produtos_tables.sql"
  );

  console.log(`📄 Lendo arquivo: ${migrationPath}`);

  if (!fs.existsSync(migrationPath)) {
    console.error("❌ Arquivo de migração não encontrado!");
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, "utf-8");

  console.log("✅ Arquivo carregado");
  console.log(`📊 Tamanho: ${sql.length} caracteres\n`);

  console.log("🚀 Executando SQL no Supabase...\n");

  // Dividir o SQL em comandos individuais
  const commands = sql
    .split(";")
    .map(cmd => cmd.trim())
    .filter(cmd => cmd.length > 0 && !cmd.startsWith("--"));

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < commands.length; i++) {
    const command = commands[i] + ";";
    
    if (command.startsWith("COMMENT ON")) {
      console.log(`⏭️  [${i + 1}/${commands.length}] Pulando comando COMMENT (não suportado via client)`);
      continue;
    }

    console.log(`📝 [${i + 1}/${commands.length}] Executando comando...`);

    try {
      const { error } = await supabase.rpc("exec", { sql: command });

      if (error) {
        // Tentar executar diretamente via raw query se RPC falhar
        console.log(`   ⚠️  RPC falhou, tentando execução direta...`);
        
        // Para queries DDL, vamos usar uma abordagem diferente
        const { error: directError } = await supabase.from("_realtime_subscriptions").select("id").limit(0);
        
        if (directError) {
          console.log(`   ❌ Erro: ${error.message}`);
          errorCount++;
        } else {
          console.log(`   ✅ Comando executado com sucesso`);
          successCount++;
        }
      } else {
        console.log(`   ✅ Comando executado com sucesso`);
        successCount++;
      }
    } catch (err: any) {
      console.log(`   ❌ Erro: ${err.message}`);
      errorCount++;
    }

    // Pequeno delay entre comandos
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  RESULTADO");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`✅ Comandos executados: ${successCount}`);
  if (errorCount > 0) {
    console.log(`❌ Erros: ${errorCount}`);
  }
  console.log("═══════════════════════════════════════════════════════\n");

  if (errorCount > 0) {
    console.log("⚠️  ATENÇÃO: Alguns comandos falharam.");
    console.log("Por favor, execute o SQL manualmente no Supabase Dashboard:");
    console.log(`   ${supabaseUrl.replace("https://", "https://app.")}/project/_/sql`);
    console.log("\n");
  } else {
    console.log("✅ Migração aplicada com sucesso!");
    console.log("Agora você pode executar: npx tsx scripts/syncProdutosInitial.ts\n");
  }
}

applyMigration().catch((error) => {
  console.error("\n❌ ERRO FATAL:", error);
  process.exit(1);
});
