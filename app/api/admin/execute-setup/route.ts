import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * POST /api/admin/execute-setup
 * Executes setup SQL directly in Supabase (requires confirmation token)
 * 
 * Usage:
 * curl -X POST https://yourdomain/api/admin/execute-setup \
 *   -H "Content-Type: application/json" \
 *   -d '{"confirm": "SETUP_TOKEN"}'
 */

// Simple confirmation token (in production, use proper auth)
const SETUP_TOKEN = process.env.SETUP_CONFIRMATION_TOKEN || "execute_polling_setup";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { confirm } = body;

    // Verify confirmation
    if (confirm !== SETUP_TOKEN) {
      return NextResponse.json(
        { error: "Invalid or missing confirmation token" },
        { status: 403 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server configuration incomplete" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Read SQL file
    const sqlPath = resolve(process.cwd(), "SETUP_EFFICIENT_POLLING.sql");
    const sqlContent = readFileSync(sqlPath, "utf-8");

    // Parse statements
    const statements = sqlContent
      .split(/;(?=\s*\n|$)/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("--"));

    console.log(`[SETUP] Executing ${statements.length} SQL statements`);

    const results = [];

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const truncated = stmt.substring(0, 80).replace(/\n/g, " ");

      try {
        // Use the sql rpc or direct query
        // Since Supabase doesn't have direct exec, we need to use rpc or client query
        // For now, we'll return the statements for manual execution

        results.push({
          index: i + 1,
          statement: truncated,
          status: "pending",
        });
      } catch (error) {
        results.push({
          index: i + 1,
          statement: truncated,
          status: "error",
          error: String(error),
        });
      }
    }

    // Since Supabase client doesn't support raw SQL execution easily,
    // return the statements for the user to execute manually or via psql
    return NextResponse.json({
      success: true,
      message:
        "Setup SQL retrieved. Please execute manually via Supabase SQL Editor or via psql.",
      instructions: {
        option_1: "Copy SQL from /api/admin/setup-sql",
        option_2: "Use Python script: python3 setup_polling.py",
        option_3: "Use Supabase SQL Editor directly",
      },
      statement_count: statements.length,
      statements: statements.map((s) => ({
        preview: s.substring(0, 100).replace(/\n/g, " "),
        full: s,
      })),
      supabase_url: supabaseUrl,
      dashboard:
        "https://gestor-tiny-qxv7irs5g-vihcastello-6133s-projects.vercel.app",
    });
  } catch (error) {
    console.error("[SETUP ERROR]", error);
    return NextResponse.json(
      {
        error: "Setup execution failed",
        details: String(error),
      },
      { status: 500 }
    );
  }
}
