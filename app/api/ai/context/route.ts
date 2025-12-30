import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import {
  getDashboardContextSummary,
  getFinanceiroContextSummary,
  getPedidosContextSummary,
  getProdutosContextSummary,
} from '@/src/repositories/aiContextRepository';

export const dynamic = 'force-dynamic';

const SUPPORTED_SCREENS = ['dashboard', 'produtos', 'compras', 'financeiro', 'pedidos'] as const;
type SupportedScreen = (typeof SUPPORTED_SCREENS)[number];

const isSupportedScreen = (value: string | null): value is SupportedScreen =>
  SUPPORTED_SCREENS.includes(value as SupportedScreen);

export async function GET(request: NextRequest) {
  try {
    const screenParam = request.nextUrl.searchParams.get('screen');
    const screen = isSupportedScreen(screenParam) ? screenParam : 'dashboard';

    let context: Record<string, unknown> = {};

    if (screen === 'dashboard') {
      const dashboard = await getDashboardContextSummary();
      context = {
        dashboard,
        nota: 'Contexto do dashboard direto do Supabase (Tiny → Supabase).',
      };
    }

    if (screen === 'produtos' || screen === 'compras') {
      const produtos = await getProdutosContextSummary();
      context = {
        produtos,
        nota:
          screen === 'compras'
            ? 'Contexto de compras baseado em estoque atual (Tiny → Supabase).'
            : 'Contexto de estoque atualizado via Tiny → Supabase.',
      };
    }

    if (screen === 'financeiro') {
      const financeiro = await getFinanceiroContextSummary();
      context = { financeiro };
    }

    if (screen === 'pedidos') {
      const pedidos = await getPedidosContextSummary();
      context = { pedidos };
    }

    return NextResponse.json({
      screen,
      context,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Erro ao montar contexto' },
      { status: 500 }
    );
  }
}
