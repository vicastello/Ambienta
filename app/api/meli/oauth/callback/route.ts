import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  console.log("[ML OAuth] code recebido:", code, "state:", state);

  if (code) {
    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Mercado Livre · Código de autorização</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 2rem; background: #f5f5f5; }
      .card { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.06); }
      h1 { font-size: 1.5rem; margin-bottom: 0.75rem; }
      p { margin: 0.5rem 0 0.5rem; line-height: 1.6; color: #374151; }
      code { display: block; padding: 12px 16px; background: #111827; color: #f9fafb; border-radius: 8px; word-break: break-all; margin-top: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .meta { margin-top: 16px; font-size: 0.875rem; color: #6b7280; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Mercado Livre · Código de autorização</h1>
      <p>Copie o código abaixo e use no script <strong>scripts/ml-exchange-token.ts</strong> para obter o <em>access_token</em>.</p>
      <code>${code}</code>
      ${
        state
          ? `<p class="meta">State recebido: <strong>${state}</strong></p>`
          : ""
      }
    </div>
  </body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  const htmlNoCode = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Mercado Livre · Nenhum código recebido</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 2rem; background: #f5f5f5; }
      .card { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.06); }
      h1 { font-size: 1.5rem; margin-bottom: 0.75rem; color: #b91c1c; }
      p { margin: 0.5rem 0 0.5rem; line-height: 1.6; color: #374151; }
      ul { margin-top: 0.75rem; padding-left: 1.25rem; color: #4b5563; }
      li { margin-bottom: 0.25rem; }
      .hint { margin-top: 1rem; font-size: 0.875rem; color: #6b7280; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Nenhum código de autorização foi recebido</h1>
      <p>Verifique se o <code>redirect_uri</code> cadastrado no app do Mercado Livre está correto:</p>
      <ul>
        <li><code>https://gestao.ambientautilidades.com.br/api/meli/oauth/callback</code></li>
      </ul>
      <p class="hint">
        Certifique-se também de iniciar o fluxo de OAuth a partir da URL gerada pelo seu app,
        para que o Mercado Livre consiga redirecionar de volta com o parâmetro <code>?code=...</code>.
      </p>
    </div>
  </body>
</html>`;

  return new NextResponse(htmlNoCode, {
    status: 400,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
