import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * GET /api/admin/setup-sql
 * Returns the setup SQL file as plaintext
 * Use this to get the SQL without any processing
 */
export async function GET(request: NextRequest) {
  try {
    const sqlPath = resolve(process.cwd(), "SETUP_EFFICIENT_POLLING.sql");
    const sqlContent = readFileSync(sqlPath, "utf-8");

    return new NextResponse(sqlContent, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Could not read SQL file", details: String(error) },
      { status: 500 }
    );
  }
}
