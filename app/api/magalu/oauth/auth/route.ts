import { NextResponse } from 'next/server';

/**
 * Inicia o fluxo OAuth 2.0 do Magalu
 * Redireciona o usuário para a página de consentimento do Magalu
 */
export async function GET() {
  const clientId = process.env.MAGALU_CLIENT_ID;
  const redirectUri = process.env.MAGALU_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Credenciais Magalu não configuradas. Configure MAGALU_CLIENT_ID e MAGALU_REDIRECT_URI.' },
      { status: 500 }
    );
  }

  // Scopes necessários para acessar pedidos e produtos do Magalu
  // Formato: open:<recurso>:<operação> (conforme documentação)
  const scopes = [
    'openid',
    'profile',
    'email',
    'offline_access', // Para obter refresh_token
    'open:order-order:read', // Acesso aos pedidos
    'open:portfolio:read', // Acesso ao portfólio/produtos
  ].join(' ');

  // Estado para segurança (pode ser melhorado com um token aleatório salvo em sessão)
  const state = Buffer.from(JSON.stringify({ timestamp: Date.now() })).toString('base64');

  // URL de autorização do Magalu OAuth
  const authUrl = new URL('https://id.magalu.com/login');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('choose_tenants', 'true'); // Obrigatório para sellers
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl.toString());
}
