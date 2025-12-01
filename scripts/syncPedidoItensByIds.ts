#!/usr/bin/env tsx
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';

function parseTinyIds(): number[] {
  return process.argv
    .slice(2)
    .map((raw) => Number(raw))
    .filter((n) => Number.isFinite(n) && n > 0) as number[];
}

async function main() {
  const tinyIds = parseTinyIds();
  if (!tinyIds.length) {
    console.error('Informe pelo menos um tiny_id para reprocessar.');
    console.error('Uso: npx tsx scripts/syncPedidoItensByIds.ts 123 456 789');
    process.exit(1);
  }

  console.log('🔐 Buscando access token do Tiny...');
  const token = await getAccessTokenFromDbOrRefresh();
  console.log('🔁 Reprocessando itens para:', tinyIds.join(', '));

  const result = await sincronizarItensPorPedidos(token, tinyIds, {
    force: true,
    retries: 2,
    delayMs: 900,
  });

  console.log('✅ Resultado:', result);
}

main().catch((err) => {
  console.error('❌ Erro ao reprocessar itens:', err?.message ?? err);
  process.exit(1);
});
