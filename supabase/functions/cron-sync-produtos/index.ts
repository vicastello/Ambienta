// Edge Function: cron-sync-produtos
// Chama o endpoint do app para sincronizar produtos/estoque.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const baseUrl = Deno.env.get('APP_BASE_URL')
    ?? Deno.env.get('HOSTINGER_API_BASE_URL')
    ?? Deno.env.get('VERCEL_API_BASE_URL'); // legado

  if (!baseUrl) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Missing APP_BASE_URL (or HOSTINGER_API_BASE_URL/VERCEL_API_BASE_URL)',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const targetUrl = `${baseUrl.replace(/\/$/, '')}/api/produtos/sync`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ limit: 100, enrichEstoque: true, modoCron: true }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      console.error(`cron-sync-produtos failed: ${res.status} ${res.statusText} - ${text.slice(0, 500)}`);
      return new Response(
        `Erro ao chamar ${targetUrl}: ${res.status} ${res.statusText} - ${text}`,
        { status: 500 }
      );
    }

    const body = await res.text();
    return new Response(JSON.stringify({ ok: true, result: body || 'OK' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`cron-sync-produtos exception: ${message}`);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
