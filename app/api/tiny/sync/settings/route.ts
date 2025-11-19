// app/api/tiny/sync/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function getOrCreateSettings() {
  const { data, error } = await supabaseAdmin
    .from('sync_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;

  if (data) return data;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('sync_settings')
    .insert({ id: 1 })
    .select('*')
    .single();

  if (insertError) throw insertError;

  return inserted;
}

export async function GET() {
  try {
    const settings = await getOrCreateSettings();

    return NextResponse.json({
      auto_sync_enabled: settings.auto_sync_enabled,
      auto_sync_window_days: settings.auto_sync_window_days,
    });
  } catch (err: any) {
    console.error('[API] /api/tiny/sync/settings GET erro', err);
    return NextResponse.json(
      {
        message: 'Erro ao carregar configurações de sincronização.',
        details: err?.message ?? 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, any> = {};
    if (typeof body.auto_sync_enabled === 'boolean') {
      patch.auto_sync_enabled = body.auto_sync_enabled;
    }
    if (body.auto_sync_window_days !== undefined) {
      const n = Number(body.auto_sync_window_days);
      if (Number.isFinite(n) && n > 0 && n <= 365) {
        patch.auto_sync_window_days = n;
      }
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json(
        { message: 'Nada para atualizar.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('sync_settings')
      .update(patch)
      .eq('id', 1)
      .select('*')
      .single();

    if (error || !data) throw error || new Error('Falha ao atualizar.');

    return NextResponse.json({
      auto_sync_enabled: data.auto_sync_enabled,
      auto_sync_window_days: data.auto_sync_window_days,
    });
  } catch (err: any) {
    console.error('[API] /api/tiny/sync/settings POST erro', err);
    return NextResponse.json(
      {
        message: 'Erro ao salvar configurações de sincronização.',
        details: err?.message ?? 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}