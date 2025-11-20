#!/usr/bin/env node
/**
 * Execute Supabase setup SQL directly
 * Usage: node setup-polling-execute.js
 * 
 * This script reads SETUP_EFFICIENT_POLLING.sql and executes it
 * directly against your Supabase database via the service role key.
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing environment variables:");
  console.error("   - NEXT_PUBLIC_SUPABASE_URL");
  console.error("   - SUPABASE_SERVICE_ROLE_KEY");
  console.error("\n📌 These are in your .env.local file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Read the setup SQL file
const setupSql = fs.readFileSync("./SETUP_EFFICIENT_POLLING.sql", "utf-8");

// Parse individual statements carefully (respecting multi-line SQL)
const statementsRaw = setupSql.split(/;(?=\s*\n)/);
const statements = statementsRaw
  .map((s) => s.trim())
  .filter((s) => {
    // Skip empty lines and comments
    const trimmed = s.trim();
    return trimmed.length > 0 && !trimmed.startsWith("--");
  });

console.log("🚀 Supabase Setup Executor");
console.log("============================");
console.log(`📝 Statements to execute: ${statements.length}`);
console.log(`🔗 Database: ${supabaseUrl}`);
console.log("");

(async () => {
  try {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      const displayText = stmt.substring(0, 70);

      process.stdout.write(
        `[${i + 1}/${statements.length}] ${displayText.replace(/\n/g, " ")}... `
      );

      // Use raw SQL query via Supabase
      const { data, error } = await supabase.rpc("execute_sql_statement", {
        query: stmt,
      });

      if (error) {
        if (
          error.message.includes("does not exist") ||
          error.message.includes("already exists")
        ) {
          console.log("⚠️  (warning, continuing)");
        } else {
          console.log("❌");
          console.error("   Error:", error.message);
          process.exit(1);
        }
      } else {
        console.log("✅");
      }
    }

    console.log("\n✨ Setup completed successfully!");
    console.log("========================================");
    console.log("📊 Verify with:");
    console.log("");
    console.log("   SELECT * FROM cron.job WHERE jobname LIKE '%sync%';");
    console.log("");
    console.log("📈 Dashboard should update every 30 seconds now.");
    console.log("🔄 Orders syncing every 1 minute automatically.");

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Fatal error:", err.message);
    process.exit(1);
  }
})();
