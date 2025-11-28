import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type SyncOverviewResponse = {
  orders: {
    total: number;
    firstDate: string | null;
    lastDate: string | null;
    withoutItems: number;
    withoutFrete: number;
  };
  produtos: {
    total: number;
    lastUpdatedAt: string | null;
    withoutImage: number;
  };
};

export async function GET() {
  try {
    const [ordersTotalRes, firstOrderRes, lastOrderRes, ordersWithItemsRes, ordersWithoutFreteRes, produtosTotalRes, produtosLastUpdatedRes, produtosWithoutImageRes] = await Promise.all([
      supabaseAdmin.from('tiny_orders').select('id', { head: true, count: 'exact' }),
      supabaseAdmin
        .from('tiny_orders')
        .select('data_criacao')
        .order('data_criacao', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('tiny_orders')
        .select('data_criacao')
        .order('data_criacao', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('tiny_orders')
        .select('id, tiny_pedido_itens!inner(id)', { head: true, count: 'exact' }),
      supabaseAdmin
        .from('tiny_orders')
        .select('id', { head: true, count: 'exact' })
        .is('valor_frete', null),
      supabaseAdmin.from('tiny_produtos').select('id', { head: true, count: 'exact' }),
      supabaseAdmin
        .from('tiny_produtos')
        .select('updated_at')
        .not('updated_at', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('tiny_produtos')
        .select('id', { head: true, count: 'exact' })
        .or('imagem_url.is.null,imagem_url.eq.')
    ]);

    if (ordersTotalRes.error) throw ordersTotalRes.error;
    if (firstOrderRes.error) throw firstOrderRes.error;
    if (lastOrderRes.error) throw lastOrderRes.error;
    if (ordersWithItemsRes.error) throw ordersWithItemsRes.error;
    if (ordersWithoutFreteRes.error) throw ordersWithoutFreteRes.error;
    if (produtosTotalRes.error) throw produtosTotalRes.error;
    if (produtosLastUpdatedRes.error) throw produtosLastUpdatedRes.error;
    if (produtosWithoutImageRes.error) throw produtosWithoutImageRes.error;

    const ordersTotal = ordersTotalRes.count ?? 0;
    const ordersWithItems = ordersWithItemsRes.count ?? 0;
    const withoutItems = Math.max(ordersTotal - ordersWithItems, 0);
    const withoutFrete = ordersWithoutFreteRes.count ?? 0;

    type OrderDateRow = { data_criacao: string | null } | null;
    type ProdutoUpdateRow = { updated_at: string | null } | null;

    const firstOrderDate = (firstOrderRes.data as OrderDateRow)?.data_criacao ?? null;
    const lastOrderDate = (lastOrderRes.data as OrderDateRow)?.data_criacao ?? null;
    const produtosLastUpdated = (produtosLastUpdatedRes.data as ProdutoUpdateRow)?.updated_at ?? null;

    const produtosTotal = produtosTotalRes.count ?? 0;
    const produtosWithoutImage = produtosWithoutImageRes.count ?? 0;

    const overview: SyncOverviewResponse = {
      orders: {
        total: ordersTotal,
        firstDate: firstOrderDate,
        lastDate: lastOrderDate,
        withoutItems,
        withoutFrete,
      },
      produtos: {
        total: produtosTotal,
        lastUpdatedAt: produtosLastUpdated,
        withoutImage: produtosWithoutImage,
      },
    };

    return NextResponse.json(overview);
  } catch (error) {
    console.error('[sync/overview] error', error);
    return NextResponse.json(
      { error: 'Erro ao consultar status de sincronização' },
      { status: 500 }
    );
  }
}
