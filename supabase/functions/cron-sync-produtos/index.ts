// Edge Function: cron-sync-produtos
// Chama o endpoint do Vercel para sincronizar produtos/estoque.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const baseUrl = Deno.env.get('VERCEL_API_BASE_URL'); // ex.: https://seu-app.vercel.app

  if (!baseUrl) {
    return new Response('Missing VERCEL_API_BASE_URL', { status: 500 });
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
      return new Response(
        `Erro ao chamar ${targetUrl}: ${res.status} ${res.statusText} - ${text}`,
        { status: 500 }
      );
    }

    const body = await res.text();
    return new Response(body || 'OK', { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Falha ao chamar sync: ${message}`, { status: 500 });
  }
});
