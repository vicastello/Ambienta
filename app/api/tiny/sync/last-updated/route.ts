import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getErrorMessage } from '@/lib/errors';
import type { Database } from '@/src/types/db-public';

type TinyOrdersRow = Database['public']['Tables']['tiny_orders']['Row'];

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('updated_at, inserted_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const row = data as (Pick<TinyOrdersRow, 'updated_at' | 'inserted_at'> | null);
    const last = row?.updated_at ?? row?.inserted_at ?? null;
    return NextResponse.json({ ok: true, lastUpdated: last });
  } catch (err: unknown) {
    const message = getErrorMessage(err) ?? 'Erro ao buscar última atualização';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
