import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../.env.vercel');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    envVars[match[1].trim()] = value;
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.vercel');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const API_BASE = process.env.API_BASE || 'http://localhost:3000';

const DEFAULT_STATUSES = ['TO_RETURN', 'CANCELLED', 'IN_CANCEL'];
const args = process.argv.slice(2);

function getArgValue(flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}

const sinceArg = getArgValue('--since') || '2025-01-01';
const limitArg = Number(getArgValue('--limit') || 0);
const batchArg = Number(getArgValue('--batch') || 100);
const concurrencyArg = Number(getArgValue('--concurrency') || 0);
const delayArg = Number(getArgValue('--delay-ms') || 0);
const sourceArg = (getArgValue('--source') || 'tags').toLowerCase();
const tagNameArg = getArgValue('--tag-name') || 'devolucao';
const dryRun = args.includes('--dry-run');
const statusesArg = getArgValue('--statuses');

const statuses = statusesArg
  ? statusesArg.split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_STATUSES;

type ShopeeRow = {
  order_sn: string;
  order_status: string;
  create_time: string;
  escrow_fetched_at?: string | null;
  raw_payload?: any;
};

async function fetchCandidatesByStatus(): Promise<ShopeeRow[]> {
  const candidates: ShopeeRow[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('shopee_orders')
      .select('order_sn, order_status, create_time, escrow_fetched_at, raw_payload')
      .in('order_status', statuses)
      .gte('create_time', sinceArg)
      .order('create_time', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Erro ao buscar pedidos: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    candidates.push(...(data as ShopeeRow[]));

    if (data.length < pageSize) {
      break;
    }

    offset += pageSize;
    if (limitArg > 0 && candidates.length >= limitArg) {
      return candidates.slice(0, limitArg);
    }
  }

  return limitArg > 0 ? candidates.slice(0, limitArg) : candidates;
}

async function fetchCandidatesByTags(): Promise<ShopeeRow[]> {
  const tagName = tagNameArg.trim().toLowerCase();
  if (!tagName) return [];

  const { data: taggedOrders, error: taggedError } = await supabase
    .from('order_tags')
    .select('order_id')
    .eq('tag_name', tagName);

  if (taggedError) {
    throw new Error(`Erro ao buscar order_tags: ${taggedError.message}`);
  }

  const orderIds = (taggedOrders || []).map((row: any) => row.order_id);
  if (orderIds.length === 0) return [];

  const orderSnList: string[] = [];
  const CHUNK_SIZE = 500;
  for (let i = 0; i < orderIds.length; i += CHUNK_SIZE) {
    const chunk = orderIds.slice(i, i + CHUNK_SIZE);
    const { data: links, error: linkError } = await supabase
      .from('marketplace_order_links')
      .select('marketplace_order_id')
      .eq('marketplace', 'shopee')
      .in('tiny_order_id', chunk);

    if (linkError) {
      throw new Error(`Erro ao buscar marketplace_order_links: ${linkError.message}`);
    }

    (links || []).forEach((link: any) => {
      if (link.marketplace_order_id) {
        orderSnList.push(String(link.marketplace_order_id));
      }
    });
  }

  if (orderSnList.length === 0) return [];

  const results: ShopeeRow[] = [];
  for (let i = 0; i < orderSnList.length; i += CHUNK_SIZE) {
    const chunk = orderSnList.slice(i, i + CHUNK_SIZE);
    const { data: orders, error: ordersError } = await supabase
      .from('shopee_orders')
      .select('order_sn, order_status, create_time, escrow_fetched_at, raw_payload')
      .in('order_sn', chunk);

    if (ordersError) {
      throw new Error(`Erro ao buscar shopee_orders: ${ordersError.message}`);
    }

    results.push(...((orders || []) as ShopeeRow[]));
  }

  return results;
}

async function fetchCandidatesByZeroTotal(): Promise<ShopeeRow[]> {
  const candidates: ShopeeRow[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('shopee_orders')
      .select('order_sn, order_status, create_time, escrow_fetched_at, raw_payload, total_amount, order_selling_price')
      .eq('total_amount', 0)
      .is('escrow_fetched_at', null)
      .gte('create_time', sinceArg)
      .order('create_time', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Erro ao buscar shopee_orders (total_amount=0): ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    candidates.push(...(data as ShopeeRow[]));

    if (data.length < pageSize) {
      break;
    }

    offset += pageSize;
    if (limitArg > 0 && candidates.length >= limitArg) {
      return candidates.slice(0, limitArg);
    }
  }

  return limitArg > 0 ? candidates.slice(0, limitArg) : candidates;
}

async function syncBatch(orderSnList: string[]) {
  const payload: Record<string, unknown> = { orderSnList };
  if (Number.isFinite(concurrencyArg) && concurrencyArg > 0) {
    payload.concurrency = concurrencyArg;
  }
  if (Number.isFinite(delayArg) && delayArg >= 0) {
    payload.delayMs = delayArg;
  }
  const response = await fetch(`${API_BASE}/api/marketplaces/shopee/sync-escrow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ao sincronizar escrow: ${text}`);
  }

  return response.json();
}

async function main() {
  console.log('=== Sync Shopee Escrow (Retornos) ===');
  console.log(`Statuses: ${statuses.join(', ')}`);
  console.log(`Source: ${sourceArg}`);
  console.log(`Tag: ${tagNameArg}`);
  console.log(`Since: ${sinceArg}`);
  console.log(`Batch: ${batchArg}`);
  console.log(`API: ${API_BASE}`);

  const sources = new Set(sourceArg.split(',').map((s) => s.trim()).filter(Boolean));
  const useTags = sources.has('tags') || sources.has('both');
  const useStatus = sources.has('status') || sources.has('both');
  const useZeroTotal = sources.has('zero-total') || sources.has('zero') || sources.has('both');

  const taggedCandidates = useTags ? await fetchCandidatesByTags() : [];
  const statusCandidates = useStatus ? await fetchCandidatesByStatus() : [];
  const zeroTotalCandidates = useZeroTotal ? await fetchCandidatesByZeroTotal() : [];

  const merged = new Map<string, ShopeeRow>();
  [...taggedCandidates, ...statusCandidates, ...zeroTotalCandidates].forEach((row) => {
    merged.set(row.order_sn, row);
  });

  const candidates = Array.from(merged.values()).filter((row) => {
    const hasEscrowDetail = Boolean(row.raw_payload && row.raw_payload.escrow_detail);
    return !row.escrow_fetched_at || !hasEscrowDetail;
  });

  console.log(`\nEncontrados ${candidates.length} pedidos sem escrow completo (escrow_fetched_at/escrow_detail).`);

  if (candidates.length > 0) {
    console.log('Exemplos:', candidates.slice(0, 10).map((c) => c.order_sn).join(', '));
  }

  if (dryRun || candidates.length === 0) {
    console.log(dryRun ? '\nDry-run: nenhum POST enviado.' : '\nNada para processar.');
    return;
  }

  let totalUpdated = 0;
  for (let i = 0; i < candidates.length; i += batchArg) {
    const batch = candidates.slice(i, i + batchArg).map((c) => c.order_sn);
    const result = await syncBatch(batch);
    const updated = Number(result?.data?.ordersUpdated || 0);
    totalUpdated += updated;
    console.log(`Batch ${i / batchArg + 1}: ${updated} atualizados (${batch.length} pedidos)`);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nConcluído. Atualizados: ${totalUpdated}`);
}

main().catch((err) => {
  console.error('Erro:', err instanceof Error ? err.message : err);
  process.exit(1);
});
