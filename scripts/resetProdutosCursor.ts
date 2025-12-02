#!/usr/bin/env tsx
import { resetProdutosSyncCursor } from '../src/repositories/produtosCursorRepository';

async function main() {
  const cursorKey = process.argv[2] ?? 'catalog_backfill';
  console.log(`🔄 Resetando cursor '${cursorKey}'...`);
  const result = await resetProdutosSyncCursor(cursorKey);
  console.log('✅ Cursor atualizado:', result);
}

main().catch((err) => {
  console.error('❌ Falha ao resetar cursor:', err instanceof Error ? err.message : err);
  process.exit(1);
});
