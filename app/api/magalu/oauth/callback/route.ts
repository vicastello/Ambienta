import { NextRequest, NextResponse } from 'next/server';

/**
 * Callback OAuth do Magalu
 * Recebe o authorization code e troca por access_token e refresh_token
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
    console.log('Access Token:', tokenData.access_token?.substring(0, 20) + '...');
    console.log('Refresh Token:', tokenData.refresh_token?.substring(0, 20) + '...');
    console.log('Expires in:', tokenData.expires_in, 'seconds');
    console.log('Scopes:', tokenData.scope);

    // Aqui você deve salvar os tokens em um banco de dados seguro
    // Por enquanto, vamos apenas mostrar na URL (APENAS PARA DESENVOLVIMENTO)

    const successUrl = new URL('/marketplaces/magalu', req.url);
    successUrl.searchParams.set('auth_success', 'true');
    successUrl.searchParams.set('access_token', tokenData.access_token);
    successUrl.searchParams.set('refresh_token', tokenData.refresh_token);
    successUrl.searchParams.set('expires_in', tokenData.expires_in);

    return NextResponse.redirect(successUrl);

  } catch (error) {
    console.error('[Magalu OAuth] Erro no callback:', error);
    return NextResponse.redirect(
      new URL(`/marketplaces/magalu?error=callback_error&message=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`, req.url)
    );
  }
}
