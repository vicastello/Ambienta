import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

// Load envs BEFORE importing lib
dotenv.config();
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env.vercel', override: true });

// Dynamic import to ensure envs are loaded first
const { supabaseAdmin } = require('../lib/supabaseAdmin');

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Uso: npx tsx scripts/applySupabaseSqlFile.ts <caminho_sql>');
    process.exit(1);
  }

  const filePath = path.isAbsolute(fileArg)
    ? fileArg
    : path.resolve(process.cwd(), fileArg);

  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`🚀 Aplicando SQL: ${filePath}`);
  const tryExec = async () => {
    const payloads: Array<{ fn: string; key: string }> = [
      { fn: 'exec_sql', key: 'sql_query' },
      { fn: 'exec_sql', key: 'query' },
      { fn: 'exec_sql', key: 'sql' },
      { fn: 'query', key: 'query' },
    ];

    let lastError: Error | null = null;
    for (const payload of payloads) {
      try {
        const { error } = await supabaseAdmin.rpc(payload.fn, {
          [payload.key]: sql,
        } as any);
        if (!error) return;
        lastError = new Error(error.message);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    if (lastError) throw lastError;
  };

  try {
    try {
      await tryExec();
      console.log('✅ SQL aplicado com sucesso (via RPC).');
    } catch (rpcError) {
      console.warn('RPC indisponível, tentando via conexão direta...');
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw rpcError instanceof Error
          ? new Error(`RPC falhou e DATABASE_URL não está configurada: ${rpcError.message}`)
          : rpcError;
      }
      const client = new Client({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();
      await client.query(sql);
      await client.end();
      console.log('✅ SQL aplicado com sucesso (via pg cliente).');
    }
  } catch (err) {
    console.error('❌ Falha ao executar SQL:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
