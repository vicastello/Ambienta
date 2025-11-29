/**
 * Endpoint para aplicar a migração de produtos
 * 
 * POST /api/admin/migrate-produtos
 * 
 * ATENÇÃO: Este endpoint deve ser protegido em produção!
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { getErrorMessage } from "@/lib/errors";
import type { Database } from "@/src/types/db-public";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

type StatementResult =
  | { statement: string; status: "success" }
  | { statement: string; status: "skipped" }
  | { statement: string; status: "error"; error: string };

export async function POST() {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Configuração do Supabase incompleta" },
        { status: 500 }
      );
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Ler arquivo de migração
    const migrationPath = path.join(
      process.cwd(),
      "migrations",
      "011_create_produtos_tables.sql"
    );

    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Executar SQL em blocos
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    const results: StatementResult[] = [];

    for (const statement of statements) {
      try {
        // Pular comentários
        if (statement.startsWith("COMMENT ON")) {
          results.push({ statement: "COMMENT", status: "skipped" });
          continue;
        }

        // Tentar executar
        const { error } = await supabase.rpc("exec_sql", {
          query: statement.endsWith(";") ? statement : `${statement};`,
        });

        if (error) {
          results.push({
            statement: statement.substring(0, 50) + "...",
            status: "error",
            error: error.message,
          });
        } else {
          results.push({
            statement: statement.substring(0, 50) + "...",
            status: "success",
          });
        }
      } catch (err: unknown) {
        results.push({
          statement: statement.substring(0, 50) + "...",
          status: "error",
          error: getErrorMessage(err) || "Erro desconhecido",
        });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    return NextResponse.json({
      success: errorCount === 0,
      totalStatements: statements.length,
      successCount,
      errorCount,
      results,
      message:
        errorCount === 0
          ? "Migração aplicada com sucesso!"
          : `${errorCount} comandos falharam. Por favor, execute o SQL manualmente no Supabase Dashboard.`,
    });
  } catch (error: unknown) {
    console.error("Erro ao aplicar migração:", error);
    return NextResponse.json(
      {
        error: getErrorMessage(error) || "Erro desconhecido",
        hint: "Execute o SQL manualmente no Supabase Dashboard (SQL Editor)",
      },
      { status: 500 }
    );
  }
}
