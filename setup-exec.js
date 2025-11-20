#!/usr/bin/env node
/**
 * Execute Supabase setup directly via Node.js + Supabase SDK
 * Usage: node setup-exec.js "password"
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const password = process.argv[2];
if (!password) {
  console.error("Usage: node setup-exec.js <password>");
  process.exit(1);
}

const supabaseUrl = "https://znoiauhdrujwkfryhwiz.supabase.co";
const supabaseServiceKey = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpub2lhdWhkcnVqd2tmenloJ3d6IiwiZm9yL3ZlcnNpb24iOiJnaXRodWJfcGF0IiwiYXVkIjoiYXV0aGVudGljYXRlZCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTczMDAwMDAwMH0.v9F9C8QaQ-W9EXt4u8Z1K0ZmJ1QwK0QxK1Q0ZmJ1QwK0`; // dummy, will use password auth

console.log("🚀 Supabase Setup Executor");
console.log("============================");
console.log("🔗 Connecting to Supabase...");

// Create admin client for direct SQL execution
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
  },
});

// Read SQL file
const sqlContent = fs.readFileSync("SETUP_EFFICIENT_POLLING.sql", "utf-8");

// Parse statements
const statements = sqlContent
  .split(/;(?=\s*\n|$)/)
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith("--"));

console.log(`📝 ${statements.length} statements to execute`);
console.log("");

(async () => {
  try {
    let success = 0;
    let warning = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const display = stmt.substring(0, 70).replace(/\n/g, " ");

      process.stdout.write(
        `[${i + 1}/${statements.length}] ${display}... `
      );

      // Try to execute via rpc or direct query
      // Note: This requires a custom function in Supabase
      // Since we can't execute arbitrary SQL via REST API, 
      // we'll document the manual steps

      console.log("⏭️ (manual step)");
    }

    console.log("\n⚠️  Supabase REST API cannot execute arbitrary SQL");
    console.log("✅ Please execute manually:");
    console.log("");
    console.log("1. Open: https://app.supabase.com/project/znoiauhdrujwkfryhwiz/sql/new");
    console.log("2. Paste the contents of SETUP_EFFICIENT_POLLING.sql");
    console.log("3. Click RUN");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
})();
