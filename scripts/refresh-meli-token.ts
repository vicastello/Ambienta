/**
 * Script para renovar o token de acesso do Mercado Livre usando o refresh_token
 */

async function refreshMeliToken() {
  console.log("🔄 Renovando token do Mercado Livre...\n");

  const clientId = process.env.ML_APP_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  const refreshToken = process.env.ML_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.error("❌ Variáveis de ambiente não configuradas:");
    console.error("   ML_APP_ID:", clientId ? "✓" : "✗");
    console.error("   ML_CLIENT_SECRET:", clientSecret ? "✓" : "✗");
    console.error("   ML_REFRESH_TOKEN:", refreshToken ? "✓" : "✗");
    return;
  }

  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    console.log("📡 Chamando API do Mercado Livre...");

    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ Erro HTTP ${response.status}:`, data);
      return;
    }

    console.log("\n✅ Token renovado com sucesso!\n");
    console.log("📋 Novos tokens (atualize o .env.local):\n");
    console.log(`ML_ACCESS_TOKEN=${data.access_token}`);
    console.log(`ML_REFRESH_TOKEN=${data.refresh_token}`);
    console.log(`\n⏰ Expira em: ${data.expires_in} segundos (${(data.expires_in / 3600).toFixed(1)} horas)`);
    console.log(`🔑 User ID: ${data.user_id}`);

  } catch (error: any) {
    console.error("❌ Erro ao renovar token:", error.message);
  }
}

refreshMeliToken().catch(console.error);
