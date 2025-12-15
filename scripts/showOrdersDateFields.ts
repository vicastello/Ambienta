import { config } from 'dotenv';

const TIME_ZONE = 'America/Sao_Paulo';

function ymdInTimeZone(date: Date, timeZone: string): string {
  // en-CA => YYYY-MM-DD
  return date.toLocaleDateString('en-CA', { timeZone });
}

function subtractOneDayYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map((n) => Number(n));
  if (!y || !m || !d) throw new Error(`YMD inválido: ${ymd}`);
  const noonUtc = Date.UTC(y, m - 1, d, 12, 0, 0);
  const yesterdayNoonUtc = new Date(noonUtc - 24 * 60 * 60 * 1000);
  return ymdInTimeZone(yesterdayNoonUtc, TIME_ZONE);
}

function looksLikeDateValue(value: unknown): boolean {
  if (typeof value === 'number') return value > 0;
  if (typeof value !== 'string') return false;

  const v = value.trim();
  if (!v) return false;

  // ISO-ish date/timestamp
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return true;
  // BR date
  if (/^\d{2}\/\d{2}\/\d{4}/.test(v)) return true;
  // epoch as string
  if (/^\d{10,13}$/.test(v)) return true;

  return false;
}

function extractRawDateFields(raw: unknown, maxEntries = 200): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const seen = new Set<unknown>();

  const stack: Array<{ value: unknown; path: string }> = [{ value: raw, path: 'raw' }];

  while (stack.length && Object.keys(out).length < maxEntries) {
    const { value, path } = stack.pop()!;
    if (!value || typeof value !== 'object') continue;
    if (seen.has(value)) continue;
    seen.add(value);

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (Object.keys(out).length >= maxEntries) break;
        stack.push({ value: value[i], path: `${path}[${i}]` });
      }
      continue;
    }

    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (Object.keys(out).length >= maxEntries) break;

      const keyLower = k.toLowerCase();
      const nextPath = `${path}.${k}`;

      const isDateKey = keyLower.includes('data') || keyLower.endsWith('date') || keyLower.includes('atualiz');
      const isPrimitive = v === null || ['string', 'number', 'boolean'].includes(typeof v);

      if (isDateKey && isPrimitive && looksLikeDateValue(v)) {
        out[nextPath] = v;
      }

      if (v && typeof v === 'object') {
        stack.push({ value: v, path: nextPath });
      }
    }
  }

  return out;
}

async function main() {
  // Carrega .env.local primeiro (prioridade) e depois .env (fallback)
  config({ path: '.env.local' });
  config();

  const { supabaseAdmin } = await import('../lib/supabaseAdmin');

  const todayYmd = ymdInTimeZone(new Date(), TIME_ZONE);
  const yesterdayYmd = subtractOneDayYmd(todayYmd);

  const fetchFirstFive = async (label: string, ymd: string) => {
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select(
        [
          'id',
          'tiny_id',
          'numero_pedido',
          'data_criacao',
          'tiny_data_prevista',
          'tiny_data_faturamento',
          'tiny_data_atualizacao',
          'inserted_at',
          'updated_at',
          'last_sync_check',
          'raw',
          'raw_payload',
        ].join(',')
      )
      .eq('data_criacao', ymd)
      .order('inserted_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(5);

    if (error) throw new Error(`${label}: ${error.message}`);

    const rows = (data ?? []) as Array<Record<string, unknown>>;

    console.log(`\n===== ${label} (${ymd}) | primeiros ${rows.length} =====`);
    for (const row of rows) {
      const dateFields: Record<string, unknown> = {};
      for (const k of Object.keys(row)) {
        if (k === 'data_criacao' || k === 'last_sync_check' || k.startsWith('tiny_data_') || k.endsWith('_at')) {
          dateFields[k] = row[k] ?? null;
        }
      }

      const rawDateFields = extractRawDateFields(row.raw);
      const rawPayloadDateFields = extractRawDateFields(row.raw_payload);

      console.log(
        JSON.stringify(
          {
            id: row.id,
            tiny_id: row.tiny_id,
            numero_pedido: row.numero_pedido,
            dateFields,
            rawDateFields,
            rawPayloadDateFields,
          },
          null,
          2
        )
      );
    }
  };

  await fetchFirstFive('ONTEM', yesterdayYmd);
  await fetchFirstFive('HOJE', todayYmd);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
