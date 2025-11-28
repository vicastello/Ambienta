import { NextResponse } from 'next/server';

import {
  getSyncSettings,
  normalizeCronSettings,
  upsertSyncSettings,
} from '@/src/repositories/syncRepository';
import type { SyncSettingsRow } from '@/src/types/db-public';

type CronSettingsPayload = ReturnType<typeof normalizeCronSettings>;

export async function GET() {
  const row = await getSyncSettings();
  return NextResponse.json(normalizeCronSettings(row));
}

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  return undefined;
};

const parsePositiveInt = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  const parsed = Math.trunc(value);
  if (parsed <= 0) return undefined;
  return parsed;
};

export async function PUT(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const updates: Partial<SyncSettingsRow> = {};

  if ('cron_dias_recent_orders' in body) {
    const value = parsePositiveInt(body.cron_dias_recent_orders);
    if (value === undefined) {
      return NextResponse.json({ error: 'cron_dias_recent_orders precisa ser um inteiro positivo' }, { status: 400 });
    }
    updates.cron_dias_recent_orders = value;
  }

  if ('cron_produtos_limit' in body) {
    const value = parsePositiveInt(body.cron_produtos_limit);
    if (value === undefined) {
      return NextResponse.json({ error: 'cron_produtos_limit precisa ser um inteiro positivo' }, { status: 400 });
    }
    updates.cron_produtos_limit = value;
  }

  if ('cron_enrich_enabled' in body) {
    const value = parseBoolean(body.cron_enrich_enabled);
    if (value === undefined) {
      return NextResponse.json({ error: 'cron_enrich_enabled precisa ser boolean' }, { status: 400 });
    }
    updates.cron_enrich_enabled = value;
  }

  if ('cron_produtos_enabled' in body) {
    const value = parseBoolean(body.cron_produtos_enabled);
    if (value === undefined) {
      return NextResponse.json({ error: 'cron_produtos_enabled precisa ser boolean' }, { status: 400 });
    }
    updates.cron_produtos_enabled = value;
  }

  if ('cron_produtos_enrich_estoque' in body) {
    const value = parseBoolean(body.cron_produtos_enrich_estoque);
    if (value === undefined) {
      return NextResponse.json({ error: 'cron_produtos_enrich_estoque precisa ser boolean' }, { status: 400 });
    }
    updates.cron_produtos_enrich_estoque = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo válido informado' }, { status: 400 });
  }

  const saved = await upsertSyncSettings(updates);
  return NextResponse.json(normalizeCronSettings(saved));
}

export const POST = PUT;
