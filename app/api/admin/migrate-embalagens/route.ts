/**
 * Endpoint para aplicar a migração de embalagens
 *
 * POST /api/admin/migrate-embalagens
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

function splitStatements(sql: string): string[] {
  const stmts: string[] = [];
  let current = "";
  let inDollar = false;
  let dollarTag: string | null = null;
  const lines = sql.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine;
    const m = line.match(/\$[A-Za-z0-9_]*\$/);
    if (m) {
      if (!inDollar) {
        inDollar = true;
        dollarTag = m[0];
      } else if (dollarTag && line.includes(dollarTag)) {
        inDollar = false;
        dollarTag = null;
      }
    }
    current += (current ? "\n" : "") + line;
    if (!inDollar && line.trim().endsWith(";")) {
      stmts.push(current.trim());
      current = "";
    }
  }
  if (current.trim().length > 0) stmts.push(current.trim());
  return stmts
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
}

export async function POST() {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Configuração do Supabase incompleta" },
        { status: 500 }
      );
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    const migrationPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "20251216000000_create_embalagens.sql"
    );

    if (!fs.existsSync(migrationPath)) {
      return NextResponse.json(
        { error: "Arquivo de migração não encontrado" },
        { status: 404 }
      );
    }

    const sql = fs.readFileSync(migrationPath, "utf-8");

    const statements = splitStatements(sql);
    const results: StatementResult[] = [];

    // Tenta executar o arquivo inteiro via RPC conhecida
    const wholeTry = await supabase.rpc("exec_sql" as any, { sql_query: sql });
    if (!wholeTry.error) {
      return NextResponse.json({
        success: true,
        totalStatements: statements.length,
        successCount: statements.length,
        errorCount: 0,
        results: [{ statement: "<full script>", status: "success" }],
        message: "Migração de embalagens aplicada com sucesso (execução única)",
      });
    }

    // Caso contrário, executa statement por statement
    for (const statement of statements) {
      try {
        if (statement.startsWith("COMMENT ON") || /RAISE\s+NOTICE/i.test(statement)) {
          results.push({ statement: "COMMENT/NOTICE", status: "skipped" });
          continue;
        }

        // Tenta com exec_sql
        const { error } = await supabase.rpc("exec_sql" as any, {
          sql_query: statement.endsWith(";") ? statement : `${statement};`,
        });

        if (error) {
          // Tenta fallback com 'exec'
          const fb = await supabase.rpc("exec" as any, { sql: statement });
          if (fb.error) {
            const msg = fb.error.message || error.message;
            // Se já existir, considera success idempotente
            if (/already exists|duplicate key|already.*extension|relation .* exists/i.test(msg)) {
              results.push({ statement: statement.slice(0, 80) + "...", status: "success" });
            } else {
              results.push({ statement: statement.slice(0, 80) + "...", status: "error", error: msg });
            }
          } else {
            results.push({ statement: statement.slice(0, 80) + "...", status: "success" });
          }
        } else {
          results.push({ statement: statement.slice(0, 80) + "...", status: "success" });
        }
      } catch (err: unknown) {
        const msg = getErrorMessage(err) || "Erro desconhecido";
        if (/already exists|duplicate key|already.*extension|relation .* exists/i.test(msg)) {
          results.push({ statement: statement.slice(0, 80) + "...", status: "success" });
        } else {
          results.push({ statement: statement.slice(0, 80) + "...", status: "error", error: msg });
        }
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
          ? "Migração de embalagens aplicada com sucesso!"
          : `${errorCount} comandos falharam. Por favor, execute o SQL manualmente no Supabase Dashboard.`,
    });
  } catch (error: unknown) {
    console.error("Erro ao aplicar migração de embalagens:", error);
    return NextResponse.json(
      {
        error: getErrorMessage(error) || "Erro desconhecido",
        hint: "Execute o SQL manualmente no Supabase Dashboard (SQL Editor)",
      },
      { status: 500 }
    );
  }
}
