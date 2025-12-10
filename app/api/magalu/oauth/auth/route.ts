import { NextResponse } from 'next/server';

/**
 * Inicia o fluxo OAuth 2.0 do Magalu
 * Redireciona o usuário para a página de login do ID Magalu
 * que depois redireciona para /oauth/authorize
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

  // Scopes necessários para acessar pedidos do Magalu (devem coincidir com os registrados no IDM)
  const scopes = [
    'open:order-order-seller:read',
    'open:order-delivery-seller:read',
    'open:order-logistics-seller:read',
  ].join(' ');

  // Estado para segurança (pode ser melhorado com um token aleatório salvo em sessão)
  const state = Buffer.from(JSON.stringify({ timestamp: Date.now() })).toString('base64');

  // URL de login do ID Magalu com parâmetros OAuth
  // O /login redireciona para /oauth/authorize após autenticação
  const authUrl = new URL('https://id.magalu.com/login');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  // Força a tela de seleção de tenant (loja/empresa)
  authUrl.searchParams.set('choose_tenants', 'true');

  console.log('[Magalu OAuth] Redirecionando para:', authUrl.toString());

  return NextResponse.redirect(authUrl.toString());
}
