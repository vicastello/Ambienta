import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function main() {
  try {
    const { data, error } = await supabaseAdmin.rpc('fn_backfill_cidade_uf_from_raw');
    if (error) {
      console.error('Erro ao backfill cidade/uf:', error.message);
      process.exit(1);
    }
    console.log(`Backfill concluído. Registros atualizados: ${data ?? 0}`);
  } catch (e: any) {
    console.error('Falha ao executar backfill:', e?.message || e);
    process.exit(1);
  }
}

main();
