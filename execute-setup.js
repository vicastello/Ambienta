#!/usr/bin/env node

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing env vars:");
  console.error("  - NEXT_PUBLIC_SUPABASE_URL");
  console.error("  - SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

console.log("📦 Initializing Supabase client...");
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Read SQL from the file we just created
const sqlPath = path.join(__dirname, "SETUP_EFFICIENT_POLLING.sql");
if (!fs.existsSync(sqlPath)) {
  console.error(`❌ SQL file not found: ${sqlPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf-8");

console.log("🔄 Executing setup SQL...");
console.log(`📝 SQL length: ${sql.length} characters`);

// Execute via Supabase query
(async () => {
  try {
    // Split by semicolon to execute statements one by one
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    console.log(`📋 Found ${statements.length} SQL statements`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i] + ";";
      console.log(`\n[${i + 1}/${statements.length}] Executing statement...`);
      console.log(`   ${stmt.substring(0, 60)}...`);

      const { data, error } = await supabase.rpc("_execute_sql", {
        sql_string: stmt,
      });

      if (error) {
        console.error(`❌ Error on statement ${i + 1}:`, error.message);
        // Continue on some errors (like cron unschedule warnings)
        if (!error.message.includes("does not exist")) {
          continue;
        }
      } else {
        console.log(`✅ Success`);
      }
    }

    console.log("\n✨ Setup completed!");
    console.log(
      "📊 Check Supabase SQL Editor for verification or run:\n"
    );
    console.log("   SELECT * FROM cron.job WHERE jobname LIKE '%sync%';");
    process.exit(0);
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
})();
