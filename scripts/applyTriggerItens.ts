/**
 * Aplicar migration do trigger de auto sync de itens ao inserir tiny_orders
 * Uso: source .env.local && npx tsx scripts/applyTriggerItens.ts
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

async function main() {
  const migrationPath = path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20251122124500_trigger_auto_sync_itens.sql"
  );

  if (!fs.existsSync(migrationPath)) {
    console.error("❌ Arquivo de migration não encontrado:", migrationPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, "utf-8");

  console.log("═══════════════════════════════════════════════════════");
  console.log("  APLICAR MIGRATION: Trigger auto sync itens");
  console.log("═══════════════════════════════════════════════════════\n");
  console.log("📄 Arquivo:", migrationPath);
  console.log("📏 Tamanho:", sql.length, "caracteres\n");
  console.log("🚀 Aplicando migration...\n");

  // Tenta diferentes RPCs que podem existir no projeto
  const tryRpc = async (fn: string, payloadKey: string) => {
    const payload: any = {};
    payload[payloadKey] = sql;
    const { error } = await supabase.rpc(fn, payload);
    return error;
  };

  let error = await tryRpc("exec_sql", "sql_query");
  if (error) {
    console.warn("⚠️  RPC exec_sql(sql_query) falhou:", error.message);
    error = await tryRpc("exec_sql", "query");
  }
  if (error) {
    console.warn("⚠️  RPC exec_sql(query) falhou:", error.message);
    error = await tryRpc("query", "query");
  }

  if (error) {
    console.error("❌ Não foi possível aplicar via RPC:", error.message);
    console.error("\n💡 Aplique manualmente colando o SQL no SQL Editor do Supabase:");
    console.error("   https://supabase.com/dashboard/project/znoiauhdrujwkfryhwiz/sql/new");
    process.exit(1);
  }

  console.log("✅ Migration aplicada com sucesso!\n");

  // Tentativa de verificação do trigger
  try {
    // Não é trivial consultar pg_trigger via API pública; apenas instruções
    console.log("🔍 Verifique o trigger com a consulta no SQL Editor:");
    console.log("   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_tiny_orders_auto_sync_itens';\n");
  } catch {}
}

main().catch((e) => {
  console.error("❌ Erro inesperado:", e?.message ?? e);
  process.exit(1);
});
