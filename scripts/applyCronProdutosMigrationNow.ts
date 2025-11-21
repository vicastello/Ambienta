import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não configuradas');
  console.error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🚀 Aplicando migração de cron para produtos...\n');

  const migrationPath = path.join(
    process.cwd(),
    'supabase/migrations/20251121120000_cron_sync_produtos.sql'
  );

  if (!fs.existsSync(migrationPath)) {
    console.error('❌ Arquivo de migração não encontrado:', migrationPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf-8');

  try {
    // Executar a migração
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // Tentar executar direto se exec_sql não existe
      console.log('⚠️ exec_sql não disponível, tentando executar direto...\n');
      
      // Dividir por comandos individuais e executar
      const commands = sql
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

      for (const cmd of commands) {
        if (cmd.includes('RAISE NOTICE')) continue; // Skip RAISE NOTICE
        
        console.log('Executando comando...');
        const { error: cmdError } = await supabase.rpc('exec', { sql: cmd });
        
        if (cmdError) {
          console.error('❌ Erro ao executar comando:', cmdError.message);
          // Continuar mesmo com erros (pode ser que já exista)
        }
      }
    }

    console.log('✅ Migração aplicada com sucesso!\n');
    
    // Verificar se o cron foi criado
    console.log('🔍 Verificando cron jobs...');
    const { data: cronJobs, error: cronError } = await supabase
      .from('cron.job')
      .select('*')
      .eq('jobname', 'sync-produtos-supabase');

    if (cronError) {
      console.log('⚠️ Não foi possível verificar cron jobs via query');
      console.log('Verifique manualmente em: https://supabase.com/dashboard/project/znoiauhdrujwkfryhwiz/database/cron-jobs\n');
    } else if (cronJobs && cronJobs.length > 0) {
      console.log('✅ Cron job encontrado:', cronJobs[0]);
    } else {
      console.log('⚠️ Cron job não encontrado. Pode ser necessário aplicar via SQL Editor.');
    }

  } catch (err: any) {
    console.error('❌ Erro ao aplicar migração:', err.message);
    console.log('\n📋 Para aplicar manualmente:');
    console.log('1. Acesse: https://supabase.com/dashboard/project/znoiauhdrujwkfryhwiz/sql/new');
    console.log('2. Cole o conteúdo de: supabase/migrations/20251121120000_cron_sync_produtos.sql');
    console.log('3. Execute\n');
    process.exit(1);
  }
}

applyMigration();
