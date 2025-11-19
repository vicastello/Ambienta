#!/usr/bin/env node
/**
 * Script para executar migration via PostgreSQL direct
 * Usa a connection string construída a partir do Supabase URL
 * 
 * Run with: node run-migration.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  // Supabase connection details (from dashboard)
  // Format: postgres://postgres:[password]@[project-ref].db.supabase.co:5432/postgres
  
  const user = 'postgres';
  // The password is not in .env.local, but Supabase provides it during project setup
  // For now, we'll try with the service role key decoded or ask the user
  
  const host = 'znoiauhdrujwkfryhwiz.db.supabase.co';
  const database = 'postgres';
  const port = 5432;

  console.log('🔧 Conectando ao PostgreSQL do Supabase...');
  console.log(`   Host: ${host}`);
  console.log(`   User: ${user}`);
  console.log(`   Database: ${database}\n`);

  const pool = new Pool({
    user,
    host,
    database,
    password: process.env.SUPABASE_DB_PASSWORD || '',
    port,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();
    console.log('✅ Conectado ao PostgreSQL\n');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '001_create_sync_tables_and_tiny_tokens.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log('🔄 Executando migration...\n');

    // Execute the entire migration script
    await client.query(sql);

    console.log('✅ Migration executada com sucesso!');

    // Verify tiny_tokens table exists
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tiny_tokens'
      );
    `);

    if (result.rows[0].exists) {
      console.log('✅ Tabela tiny_tokens criada com sucesso!');
    }

    client.release();
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error('\n💡 Dica: Se o erro for de autenticação, você precisa:');
    console.error('   1. Ir ao Supabase Dashboard > Project Settings > Database');
    console.error('   2. Encontrar a senha do usuário postgres');
    console.error('   3. Executar: export SUPABASE_DB_PASSWORD="sua_senha"');
    console.error('   4. Tentar novamente');
  } finally {
    await pool.end();
  }
}

runMigration();
