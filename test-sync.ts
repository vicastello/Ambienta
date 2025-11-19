#!/usr/bin/env node
/**
 * Test script: Dispara um sync de November 2025 (01 a 30) 
 * com PROCESS_IN_APP=true e PROCESS_MAX_REQUESTS=5000
 * Monitora os logs para verificar quantos pedidos foram buscados
 */

import { supabaseAdmin } from './lib/supabaseAdmin';
import processJob from './lib/syncProcessor';

async function main() {
  try {
    console.log('🔄 Iniciando teste de sync...\n');

    // 1. Cria um novo job para November 2025
    const jobPayload = {
      status: 'running',
      params: {
        mode: 'range',
        dataInicial: '2025-11-01',
        dataFinal: '2025-11-30',
      },
    };

    const { data: jobInsert, error: jobError } = await supabaseAdmin
      .from('sync_jobs')
      .insert(jobPayload)
      .select('*')
      .single();

    if (jobError || !jobInsert) {
      throw new Error('Não foi possível criar o job de sync: ' + jobError?.message);
    }

    const jobId = jobInsert.id as string;
    console.log(`✅ Job criado: ${jobId}`);
    console.log(`   Período: 2025-11-01 até 2025-11-30\n`);

    // 2. Dispara o processor direto
    console.log('🚀 Iniciando processamento...\n');
    const result = await processJob(jobId);

    // 3. Busca os logs do job
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('sync_logs')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (!logsError) {
      console.log('\n📋 Logs do sync:\n');
      logs?.forEach((log) => {
        const timestamp = new Date(log.created_at).toLocaleTimeString();
        console.log(`[${timestamp}] [${log.level.toUpperCase()}] ${log.message}`);
        if (log.meta) {
          console.log(`  └─ ${JSON.stringify(log.meta)}`);
        }
      });
    }

    // 4. Resume resultado final
    console.log('\n' + '='.repeat(60));
    console.log('📊 Resultado Final:');
    console.log('='.repeat(60));
    console.log(`✓ OK: ${result.ok}`);
    console.log(`✓ Total de requisições: ${result.totalRequests}`);
    console.log(`✓ Total de pedidos salvos: ${result.totalOrders}`);

    // 5. Verifica quantos pedidos ficaram no banco para esse período
    const { count: dbCount } = await supabaseAdmin
      .from('tiny_orders')
      .select('*', { count: 'exact' })
      .gte('data_criacao', '2025-11-01')
      .lte('data_criacao', '2025-11-30');

    console.log(`✓ Pedidos no banco (Nov 2025): ${dbCount}`);
    console.log('='.repeat(60));
  } catch (err: any) {
    console.error('❌ Erro:', err?.message ?? String(err));
    process.exit(1);
  }
}

main();
