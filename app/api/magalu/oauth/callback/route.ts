import { NextRequest, NextResponse } from 'next/server';
import { saveTokensToDb } from '@/lib/magaluClientV2';

/**
 * Callback OAuth do Magalu
 * Recebe o authorization code e troca por access_token e refresh_token
 * Salva os tokens no Supabase para uso posterior
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    console.error('[Magalu OAuth] Erro no callback:', error);
    return NextResponse.redirect(
      new URL(`/marketplaces/magalu?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/marketplaces/magalu?error=no_code', req.url)
    );
  }

  const clientId = process.env.MAGALU_CLIENT_ID;
  const clientSecret = process.env.MAGALU_CLIENT_SECRET;
  const redirectUri = process.env.MAGALU_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    console.error('[Magalu OAuth] Credenciais não configuradas');
    return NextResponse.redirect(
      new URL('/marketplaces/magalu?error=config_missing', req.url)
    );
  }

  try {
    console.log('[Magalu OAuth] Trocando code por tokens...');
    console.log('[Magalu OAuth] State recebido:', state);

    // Trocar authorization code por tokens
    const tokenResponse = await fetch('https://id.magalu.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: code,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Magalu OAuth] Erro ao obter tokens:', tokenResponse.status, errorText);
      return NextResponse.redirect(
        new URL(`/marketplaces/magalu?error=token_exchange_failed&details=${encodeURIComponent(errorText)}`, req.url)
      );
    }

    const tokenData = await tokenResponse.json();

    console.log('[Magalu OAuth] Tokens obtidos com sucesso!');
    console.log('[Magalu OAuth] Access Token:', tokenData.access_token?.substring(0, 30) + '...');
    console.log('[Magalu OAuth] Refresh Token:', tokenData.refresh_token?.substring(0, 30) + '...');
    console.log('[Magalu OAuth] Expires in:', tokenData.expires_in, 'seconds');
    console.log('[Magalu OAuth] Scopes:', tokenData.scope);

    // Extrair tenant_id do state se disponível
    let tenantId: string | undefined;
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        tenantId = stateData.tenant_id;
      } catch {
        // State inválido, ignorar
      }
    }

    // Salvar tokens no Supabase
    await saveTokensToDb({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
      tenant_id: tenantId,
    });

    console.log('[Magalu OAuth] Tokens salvos no Supabase com sucesso!');

    // Redirecionar para página de sucesso (sem tokens na URL por segurança)
    const successUrl = new URL('/marketplaces/magalu', req.url);
    successUrl.searchParams.set('auth_success', 'true');

    return NextResponse.redirect(successUrl);

  } catch (error) {
    console.error('[Magalu OAuth] Erro no callback:', error);
    return NextResponse.redirect(
      new URL(`/marketplaces/magalu?error=callback_error&message=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`, req.url)
    );
  }
}
