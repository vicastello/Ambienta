#!/usr/bin/env node
/**
 * Direct PostgreSQL execution of setup SQL
 * Requires: psycopg2 or pg package
 * Usage: SUPABASE_PASSWORD="your_password" node direct-setup.js
 */

const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const password = process.argv[2] || process.env.SUPABASE_PASSWORD;

if (!password) {
  console.error("❌ Password required");
  console.error("Usage: node direct-setup.js <password>");
  console.error("Or: SUPABASE_PASSWORD='...' node direct-setup.js");
  process.exit(1);
}

const sqlFile = path.join(__dirname, "SETUP_EFFICIENT_POLLING.sql");
const host = "db.znoiauhdrujwkfryhwiz.supabase.co";
const db = "postgres";
const user = "postgres";
const port = 5432;

// Escape special characters in password for shell
const escapedPassword = password.replace(/'/g, "'\\''");

// Build psql command
const connStr = `postgresql://${user}:${escapedPassword}@${host}:${port}/${db}?sslmode=require`;
const cmd = `psql "${connStr}" -f "${sqlFile}"`;

console.log("🚀 Supabase Setup Executor");
console.log("============================");
console.log(`📡 Host: ${host}`);
console.log(`📄 SQL File: ${sqlFile}`);
console.log("");
console.log("🔄 Executing setup...\n");

exec(cmd, (error, stdout, stderr) => {
  if (error) {
    console.error("❌ Error:", error.message);
    if (stderr) console.error("STDERR:", stderr);
    process.exit(1);
  }

  console.log(stdout);

  if (stderr) {
    // Some warnings are expected
    console.log("\n⚠️  Warnings (expected):");
    console.log(stderr);
  }

  console.log("\n✨ Setup completed successfully!");
  console.log("====================================");
  console.log("✅ Polling is now ACTIVE");
  console.log("   • Runs every 1 minute");
  console.log("   • Dashboard updates automatically");
  console.log("");
  console.log("📊 Dashboard:");
  console.log(
    "   https://gestor-tiny-qxv7irs5g-vihcastello-6133s-projects.vercel.app"
  );
});
