#!/usr/bin/env tsx
import { syncProdutosFromTiny } from '@/src/lib/sync/produtos';

async function main() {
  const limitArg = Number(process.argv[2]);
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : undefined;
  console.log('🚀 Executando syncProdutosFromTiny em modo backfill...');
  const result = await syncProdutosFromTiny({
    mode: 'backfill',
    modoCron: true,
    limit,
    cursorKey: 'catalog_backfill',
    modeLabel: 'manual_backfill',
  });
  console.log('Resultado:', result);
}

main().catch((err) => {
  console.error('❌ Falha ao executar backfill manual:', err instanceof Error ? err.message : err);
  process.exit(1);
});
