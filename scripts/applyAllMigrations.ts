import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Variáveis de ambiente do Supabase não configuradas (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function listSqlFiles(migrationsDir: string): string[] {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // filenames carry chronological order
}

function splitStatements(sql: string): string[] {
  // naive split by ';' but keep inside dollar-quoted functions
  const stmts: string[] = [];
  let current = "";
  let inDollar = false;
  let dollarTag: string | null = null;
  const lines = sql.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine;
    // detect start/end of dollar-quote ($$ or $tag$)
    const dollarStart = line.match(/\$[A-Za-z0-9_]*\$/);
    if (dollarStart) {
      if (!inDollar) {
        inDollar = true;
        dollarTag = dollarStart[0];
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

  // filter comments-only
  return stmts
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^--/.test(s));
}

async function tryExecWhole(sql: string): Promise<{ ok: boolean; err?: string }> {
  // Preferred RPC function names we saw in repo
  const candidates: Array<{ fn: string; payload: Record<string, any> }> = [
    { fn: 'exec_sql', payload: { sql_query: sql } },
    { fn: 'exec', payload: { sql } },
  ];
  for (const c of candidates) {
    try {
      const { error } = await supabase.rpc(c.fn as any, c.payload);
      if (!error) return { ok: true };
      // continue to next candidate
    } catch (e: any) {
      // continue
    }
  }
  return { ok: false, err: 'No RPC function available to execute whole script' };
}

async function tryExecStatement(stmt: string): Promise<{ ok: boolean; skip?: boolean; err?: string }>{
  const t = stmt.trim();
  // Skip comment and RAISE NOTICE
  if (t.startsWith('--') || /RAISE\s+NOTICE/i.test(t) || t.startsWith('COMMENT ON')) {
    return { ok: true, skip: true };
  }
  // Try exec_sql first
  const candidates: Array<{ fn: string; payload: Record<string, any> }> = [
    { fn: 'exec_sql', payload: { query: t.endsWith(';') ? t : t + ';' } },
    { fn: 'exec', payload: { sql: t } },
  ];
  for (const c of candidates) {
    try {
      const { error } = await supabase.rpc(c.fn as any, c.payload);
      if (!error) return { ok: true };
      // If error message indicates existing objects, treat as ok
      const msg = error.message || '';
      if (/already exists|duplicate key|already.*extension|relation .* exists/i.test(msg)) {
        return { ok: true };
      }
    } catch (e: any) {
      const msg = e?.message || '';
      if (/already exists|duplicate key|already.*extension|relation .* exists/i.test(msg)) {
        return { ok: true };
      }
    }
  }
  return { ok: false, err: 'Failed to execute via RPC' };
}

async function applyAll() {
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error('❌ Pasta de migrations não encontrada:', migrationsDir);
    process.exit(1);
  }
  const files = listSqlFiles(migrationsDir);
  console.log(`📦 Encontrados ${files.length} arquivos de migration em ${migrationsDir}`);

  let totalStatements = 0;
  let success = 0;
  let skipped = 0;
  let errors = 0;

  for (const f of files) {
    const full = path.join(migrationsDir, f);
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`▶️  Aplicando: ${f}`);
    console.log(`═══════════════════════════════════════════════════════`);
    const sql = fs.readFileSync(full, 'utf-8');

    // First try whole script at once
    const whole = await tryExecWhole(sql);
    if (whole.ok) {
      console.log(`✅ Aplicado como script único`);
      continue;
    }

    // Fallback: split statements
    const stmts = splitStatements(sql);
    totalStatements += stmts.length;

    for (let i = 0; i < stmts.length; i++) {
      const stmt = stmts[i];
      process.stdout.write(`📝 [${i + 1}/${stmts.length}] `);
      try {
        const res = await tryExecStatement(stmt);
        if (res.skip) {
          console.log('⏭️  pulado');
          skipped++;
        } else if (res.ok) {
          console.log('✅ ok');
          success++;
        } else {
          console.log('❌ erro');
          errors++;
        }
      } catch (e) {
        console.log('❌ erro inesperado');
        errors++;
      }
      // small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 60));
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`RESULTADO`);
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`Total statements: ${totalStatements}`);
  console.log(`Sucesso: ${success}`);
  console.log(`Pulados: ${skipped}`);
  console.log(`Erros: ${errors}`);

  if (errors > 0) {
    console.log('\n⚠️  Alguns comandos falharam. Verifique o log acima e considere aplicar manualmente via SQL Editor do Supabase.');
    process.exitCode = 1;
  } else {
    console.log('\n✅ Todas as migrations foram aplicadas (ou já estavam aplicadas).');
  }
}

applyAll().catch((e) => {
  console.error('❌ Falha ao aplicar migrations:', e);
  process.exit(1);
});
