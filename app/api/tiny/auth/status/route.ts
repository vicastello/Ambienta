import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';

export async function GET(req: NextRequest) {
  try {
    const cookieAccess = req.cookies.get('tiny_access_token')?.value || null;
    const cookieExpiresAtStr = req.cookies.get('tiny_expires_at')?.value || null;

    // read DB tokens too
    const { data: tokenRow, error: tokenErr } = await supabaseAdmin.from('tiny_tokens').select('*').eq('id', 1).maybeSingle();

    if (tokenErr) {
      console.error('[auth/status] erro ao ler tiny_tokens', tokenErr);
    }

    let dbExpiresAt: string | null = null;
    let dbHasRefresh = false;
    if (tokenRow) {
      dbHasRefresh = !!tokenRow.refresh_token;
      if (typeof tokenRow.expires_at === 'number') {
        dbExpiresAt = new Date(tokenRow.expires_at).toISOString();
      }
    }

    // try to get a valid access token server-side (will refresh if needed)
    let serverConnected = false;
    try {
      const at = await getAccessTokenFromDbOrRefresh();
      serverConnected = !!at;
    } catch (e) {
      serverConnected = false;
    }

    return NextResponse.json({
      connected: !!cookieAccess || serverConnected,
      cookies: {
        tiny_access_token: cookieAccess ? '***' : null,
        tiny_expires_at: cookieExpiresAtStr ?? null,
      },
      db: {
        has_refresh_token: dbHasRefresh,
        expiresAt: dbExpiresAt,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        connected: false,
        message: 'Erro interno ao ler status do Tiny.',
        details: String(err),
      },
      { status: 500 }
    );
  }
}