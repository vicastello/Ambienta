import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET /api/admin/health
 * Quick health check for the app
 */
export async function GET(req: NextRequest) {
  try {
    // Check if the app can connect to Supabase
    const { error } = await supabaseAdmin
      .from('sync_jobs')
      .select('id', { count: 'exact' })
      .limit(1);

    if (error) {
      return NextResponse.json(
        { ok: false, message: 'Database error', error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'App is healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: 'Error', error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
