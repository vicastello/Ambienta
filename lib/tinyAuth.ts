import { supabaseAdmin } from './supabaseAdmin';

const TOKEN_URL = process.env.TINY_TOKEN_URL ?? 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';
const CLIENT_ID = process.env.TINY_CLIENT_ID;
const CLIENT_SECRET = process.env.TINY_CLIENT_SECRET;

export async function getAccessTokenFromDbOrRefresh(): Promise<string> {
  // read tokens row
  const { data, error } = await supabaseAdmin
    .from('tiny_tokens')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    // log to sync_logs for observability
    try {
      await supabaseAdmin.from('sync_logs').insert({ job_id: null, level: 'error', message: 'Erro ao ler tiny_tokens', meta: { error: error.message } });
    } catch (e) {
      console.error('[tinyAuth] erro ao gravar sync_logs', e);
    }

    throw new Error('Erro ao ler tiny_tokens: ' + error.message);
  }

  const row: any = data as any;
  const now = Date.now();

  if (row && row.access_token && typeof row.expires_at === 'number' && row.expires_at - 60000 > now) {
    // token ainda válido (com margem de 60s)
    return row.access_token;
  }

  // precisa refresh
  if (!row || !row.refresh_token) {
    throw new Error('Nenhum refresh_token disponível para renovar access_token. Conecte o Tiny novamente.');
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('CLIENT_ID ou CLIENT_SECRET do Tiny não configurados no ambiente.');
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('client_id', CLIENT_ID);
  body.set('client_secret', CLIENT_SECRET);
  body.set('refresh_token', row.refresh_token);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('[tinyAuth] Erro ao trocar refresh_token:', res.status, text);
    try {
      await supabaseAdmin.from('sync_logs').insert({ job_id: null, level: 'error', message: 'Erro ao trocar refresh_token', meta: { status: res.status, body: text } });
    } catch (e) {
      console.error('[tinyAuth] erro ao gravar sync_logs', e);
    }
    throw new Error('Erro ao renovar token Tiny: ' + text);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch (e) {
    console.error('[tinyAuth] Não foi possível parsear resposta do Tiny:', text);
    try {
      await supabaseAdmin.from('sync_logs').insert({ job_id: null, level: 'error', message: 'Resposta inválida do Tiny ao renovar token', meta: { body: text } });
    } catch (err) {
      console.error('[tinyAuth] erro ao gravar sync_logs', err);
    }
    throw new Error('Resposta inválida do Tiny ao renovar token');
  }

  const nowMs = Date.now();
  const expiresAt = nowMs + ((json.expires_in ?? 0) - 60) * 1000;

  // update DB
  try {
    await supabaseAdmin
      .from('tiny_tokens')
      .upsert(
        {
          id: 1,
          access_token: json.access_token,
          refresh_token: json.refresh_token ?? row.refresh_token,
          expires_at: expiresAt,
          scope: json.scope ?? row.scope ?? null,
          token_type: json.token_type ?? row.token_type ?? null,
        },
        { onConflict: 'id' }
      );
  } catch (e) {
    console.error('[tinyAuth] Erro ao salvar tokens renovados no DB', e);
    try {
      await supabaseAdmin.from('sync_logs').insert({ job_id: null, level: 'error', message: 'Erro ao salvar tokens renovados no DB', meta: { error: (e as any)?.message ?? String(e) } });
    } catch (err) {
      console.error('[tinyAuth] erro ao gravar sync_logs', err);
    }
  }

  if (!json.access_token) throw new Error('Tiny não retornou access_token no refresh.');

  return json.access_token;
}
