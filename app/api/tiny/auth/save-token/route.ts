import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getErrorMessage } from '@/lib/errors';

type SaveTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

/**
 * POST /api/tiny/auth/save-token
 * Body: { access_token, refresh_token, expires_in }
 * 
 * Use este endpoint para salvar o token manualmente se o callback falhar
 */
export async function POST(req: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      rawBody = null;
    }
    const body = isRecord(rawBody) ? (rawBody as SaveTokenPayload) : null;

    const { access_token, refresh_token, expires_in, scope, token_type } = body ?? {};

    if (!access_token || !refresh_token || !expires_in) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const parsedExpires = typeof expires_in === 'number' ? expires_in : Number(expires_in);
    if (!Number.isFinite(parsedExpires)) {
      return NextResponse.json(
        { success: false, error: 'expires_in precisa ser numérico' },
        { status: 400 }
      );
    }

    const expiresAt = Date.now() + Math.max(0, (parsedExpires - 60) * 1000);

    console.log('[save-token] Salvando token no DB...');

    const { error } = await supabaseAdmin
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
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[save-token] ✅ Token salvo com sucesso!');
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error('[save-token] ❌ Exception:', e);
    return NextResponse.json(
      { success: false, error: getErrorMessage(e) || 'Erro desconhecido' },
      { status: 500 }
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
