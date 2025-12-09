#!/usr/bin/env tsx
import 'dotenv/config';

const BASE_URL = process.env.GESTOR_TINY_BASE_URL ?? 'http://localhost:3000';
const DAYS_BACK = Math.min(Math.max(Number(process.env.SYNC_DAYS_BACK ?? 90), 1), 90);
const FORCE = process.env.SYNC_FORCE ?? '1';

async function main() {
  const url = `${BASE_URL}/api/tiny/sync?mode=orders&daysBack=${DAYS_BACK}&force=${FORCE}`;
  console.log(`[sync] Disparando POST ${url}`);

  const response = await fetch(url, { method: 'POST' });

  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    console.error('[sync] Falha ao enfileirar sync', { status: response.status, body });
    process.exit(1);
  }

  console.log('[sync] Job enfileirado', body);
}

main().catch((err) => {
  console.error('[sync] Erro inesperado', err);
  process.exit(1);
});
