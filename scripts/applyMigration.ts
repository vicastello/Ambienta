import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  const migrationPath = path.join(
    process.cwd(),
    "migrations",
    "011_create_produtos_tables.sql"
  );

  const sql = fs.readFileSync(migrationPath, "utf-8");

  console.log("Aplicando migração 011_create_produtos_tables.sql...");

  const { data, error } = await supabase.rpc("exec_sql", { sql_query: sql });

  if (error) {
    console.error("Erro:", error);
    process.exit(1);
  }

  console.log("✅ Migração aplicada com sucesso!");
}

applyMigration();
