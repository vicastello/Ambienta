import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const shopId = searchParams.get("shop_id");
  const state = searchParams.get("state");

  console.log("[Shopee OAuth] code recebido:", code, "shop_id:", shopId, "state:", state);

  if (code) {
    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Shopee · Código de autorização</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 2rem; background: linear-gradient(135deg, #ee4d2d 0%, #f05d40 100%); }
      .card { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); }
      h1 { font-size: 1.5rem; margin-bottom: 0.75rem; color: #ee4d2d; }
      p { margin: 0.5rem 0 0.5rem; line-height: 1.6; color: #374151; }
      code { display: block; padding: 12px 16px; background: #111827; color: #f9fafb; border-radius: 8px; word-break: break-all; margin-top: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .meta { margin-top: 16px; font-size: 0.875rem; color: #6b7280; }
      .badge { display: inline-block; padding: 4px 12px; background: #fee2e2; color: #991b1b; border-radius: 6px; font-size: 0.75rem; font-weight: 600; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>🛍️ Shopee · Código de autorização</h1>
      <p>Autorização OAuth recebida com sucesso! Use os dados abaixo para trocar por um <strong>access_token</strong>.</p>
      <p><strong>Authorization Code:</strong></p>
      <code>${code}</code>
      ${
        shopId
          ? `<p class="meta"><strong>Shop ID:</strong> ${shopId}</p>`
          : ""
      }
      ${
        state
          ? `<p class="meta"><strong>State:</strong> ${state}</p>`
          : ""
      }
      <p class="badge">⚠️ Este código expira em alguns minutos</p>
      <p style="margin-top: 16px; font-size: 0.875rem; color: #6b7280;">
        <strong>Próximos passos:</strong><br>
        1. Use este código em um script de troca de token<br>
        2. O script deve chamar a API da Shopee para obter o access_token<br>
        3. Salve o access_token no arquivo .env.local
      </p>
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
    <title>Shopee · Nenhum código recebido</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 2rem; background: linear-gradient(135deg, #ee4d2d 0%, #f05d40 100%); }
      .card { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); }
      h1 { font-size: 1.5rem; margin-bottom: 0.75rem; color: #b91c1c; }
      p { margin: 0.5rem 0 0.5rem; line-height: 1.6; color: #374151; }
      ul { margin-top: 0.75rem; padding-left: 1.25rem; color: #4b5563; }
      li { margin-bottom: 0.25rem; }
      .hint { margin-top: 1rem; padding: 12px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; font-size: 0.875rem; color: #92400e; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>❌ Nenhum código de autorização foi recebido</h1>
      <p>Verifique se o <strong>redirect_uri</strong> cadastrado no painel de parceiros da Shopee está correto:</p>
      <ul>
        <li><code>https://gestao.ambientautilidades.com.br/api/shopee/oauth/callback</code></li>
      </ul>
      <div class="hint">
        <strong>💡 Dica:</strong> Certifique-se de iniciar o fluxo OAuth através da URL correta da Shopee Open Platform.
        A URL deve conter os parâmetros <code>partner_id</code>, <code>redirect</code> e <code>sign</code>.
      </div>
      <p style="margin-top: 16px; font-size: 0.875rem; color: #6b7280;">
        <strong>Documentação:</strong><br>
        <a href="https://open.shopee.com/documents/v2/v2.auth.get_access_token" target="_blank" style="color: #ee4d2d;">
          Shopee Open API - Authorization
        </a>
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
