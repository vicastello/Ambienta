// @ts-nocheck
/* eslint-disable */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('updated_at, inserted_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const last = (data as any)?.updated_at ?? (data as any)?.inserted_at ?? null;
    return NextResponse.json({ ok: true, lastUpdated: last });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message ?? String(err) }, { status: 500 });
  }
}
// @ts-nocheck
