import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/tiny/auth/save-token
 * Body: { access_token, refresh_token, expires_in }
 * 
 * Use este endpoint para salvar o token manualmente se o callback falhar
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { access_token, refresh_token, expires_in, scope, token_type } = body;

    if (!access_token || !refresh_token || !expires_in) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const expiresAt = Date.now() + (expires_in - 60) * 1000;

    console.log('[save-token] Salvando token no DB...');

    const { data, error } = await supabaseAdmin
      .from('tiny_tokens')
      .upsert(
        {
          id: 1,
          access_token,
          refresh_token,
          expires_at: expiresAt,
          scope: scope ?? null,
          token_type: token_type ?? null,
        },
        { onConflict: 'id' }
      );

    if (error) {
      console.error('[save-token] ❌ DB Error:', error);
      return NextResponse.json(
        { success: false, error: error.message, details: error },
        { status: 500 }
      );
    }

    console.log('[save-token] ✅ Token salvo com sucesso!');
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('[save-token] ❌ Exception:', e);
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 }
    );
  }
}
