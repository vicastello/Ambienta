import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getErrorMessage } from '@/lib/errors';

type TinyTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

const TOKEN_URL = process.env.TINY_TOKEN_URL ?? 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';
const CLIENT_ID = process.env.TINY_CLIENT_ID;
const CLIENT_SECRET = process.env.TINY_CLIENT_SECRET;

/**
 * GET /api/admin/cron/refresh-tiny-token
 * 
 * Cron job que verifica e renova o token do Tiny automaticamente.
 * Deve ser chamado pelo Vercel Cron a cada 6 horas.
 * 
 * Configurar em vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/admin/cron/refresh-tiny-token",
 *     "schedule": "0 *\/6 * * *"
 *   }]
 * }
 */
export async function GET(request: Request) {
  try {
    // Verificar secret para segurança
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.CRON_SECRET;
    
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Buscar token atual
    const { data: tokenRow, error: tokenErr } = await supabaseAdmin
      .from('tiny_tokens')
      .select('id, access_token, refresh_token, expires_at, scope, token_type')
      .eq('id', 1)
      .maybeSingle();

    if (tokenErr) {
      console.error('[cron-refresh] erro ao ler tiny_tokens', tokenErr);
      return NextResponse.json({ 
        success: false, 
        error: 'Erro ao ler tokens' 
      }, { status: 500 });
    }

    if (!tokenRow || !tokenRow.refresh_token) {
      console.log('[cron-refresh] Nenhum refresh_token encontrado, pulando...');
      return NextResponse.json({ 
        success: true,
        skipped: true,
        reason: 'Nenhum refresh_token configurado'
      });
    }

    // 2. Verificar se precisa renovar (renova se falta menos de 4 horas)
    const now = Date.now();
    const fourHours = 4 * 60 * 60 * 1000;
    const expiresAtTimestamp = tokenRow.expires_at ?? 0;
    const expiresInMs = expiresAtTimestamp - now;
    const needsRefresh = !tokenRow.expires_at || expiresInMs < fourHours;

    if (!needsRefresh) {
      const expiresIn = Math.floor(expiresInMs / 1000 / 60);
      console.log(`[cron-refresh] Token ainda válido por ${expiresIn} minutos, pulando...`);
      return NextResponse.json({ 
        success: true,
        skipped: true,
        reason: 'Token ainda válido',
        expiresInMinutes: expiresIn
      });
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
      console.error('[cron-refresh] CLIENT_ID ou CLIENT_SECRET não configurados');
      return NextResponse.json({ 
        success: false, 
        error: 'Credenciais não configuradas' 
      }, { status: 500 });
    }

    // 3. Renovar token
    console.log('[cron-refresh] Renovando token...');
    
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('client_id', CLIENT_ID);
    body.set('client_secret', CLIENT_SECRET);
    body.set('refresh_token', tokenRow.refresh_token);

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded', 
        Accept: 'application/json' 
      },
      body,
    });

    const text = await res.text();
    
    if (!res.ok) {
      console.error('[cron-refresh] Erro ao renovar:', res.status, text);
      
      await supabaseAdmin.from('sync_logs').insert({
        job_id: null,
        level: 'error',
        message: 'Falha no cron de renovação de token Tiny',
        meta: { status: res.status, response: text }
      });

      return NextResponse.json({ 
        success: false, 
        error: `Erro ao renovar token: ${res.status}`,
        needsReauth: res.status === 400 || res.status === 401
      }, { status: 500 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error('[cron-refresh] Resposta inválida:', text);
      return NextResponse.json({ 
        success: false, 
        error: 'Resposta inválida' 
      }, { status: 500 });
    }

    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({ success: false, error: 'Resposta inválida' }, { status: 500 });
    }

    const json = parsed as TinyTokenResponse;

    if (!json.access_token) {
      return NextResponse.json({ success: false, error: 'Resposta sem access_token' }, { status: 500 });
    }

    // 4. Salvar novos tokens
    const nowMs = Date.now();
    const expiresInSeconds = typeof json.expires_in === 'number' ? json.expires_in : 0;
    const expiresAt = nowMs + Math.max(0, (expiresInSeconds - 60) * 1000);

    const { error: updateErr } = await supabaseAdmin
      .from('tiny_tokens')
      .upsert(
        {
          id: 1,
          access_token: json.access_token,
          refresh_token: json.refresh_token ?? tokenRow.refresh_token,
          expires_at: expiresAt,
          scope: json.scope ?? tokenRow.scope ?? null,
          token_type: json.token_type ?? tokenRow.token_type ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (updateErr) {
      console.error('[cron-refresh] Erro ao salvar:', updateErr);
      return NextResponse.json({ 
        success: false, 
        error: 'Erro ao salvar tokens' 
      }, { status: 500 });
    }

    // 5. Log de sucesso
    await supabaseAdmin.from('sync_logs').insert({
      job_id: null,
      level: 'info',
      message: 'Token Tiny renovado automaticamente pelo cron',
      meta: { 
          expires_in: expiresInSeconds,
        expires_at: new Date(expiresAt).toISOString()
      }
    });

    console.log('[cron-refresh] Token renovado com sucesso!');

    return NextResponse.json({ 
      success: true, 
      message: 'Token renovado automaticamente',
      expires_at: new Date(expiresAt).toISOString(),
      expires_in_hours: expiresInSeconds > 0 ? Math.floor(expiresInSeconds / 3600) : null
    });

  } catch (error: unknown) {
    console.error('[cron-refresh] Erro inesperado:', error);
    const message = getErrorMessage(error) || 'Erro desconhecido';
    
    await supabaseAdmin.from('sync_logs').insert({
      job_id: null,
      level: 'error',
      message: 'Erro inesperado no cron de renovação de token',
      meta: { error: message }
    });

    return NextResponse.json({ 
      success: false, 
      error: message 
    }, { status: 500 });
  }
}
