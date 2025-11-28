import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  try {
    // tiny_orders: total, firstDate, lastDate

    // tiny_orders: total, firstDate, lastDate
    const { data: ordersAgg, error: ordersError } = await supabaseAdmin
      .from('tiny_orders')
      .select('count:id, min:data_criacao, max:data_criacao')
      .maybeSingle();
    if (ordersError) throw ordersError;

    // Tipos explícitos para evitar never
    type OrdersAgg = { count: string; min: string | null; max: string | null } | null;
    const ordersTyped = ordersAgg as OrdersAgg;

    // tiny_pedido_itens: total
    const { data: itemsAgg, error: itemsError } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id', { count: 'exact', head: true });
    if (itemsError) throw itemsError;
    const itemsTotal = typeof itemsAgg === 'number' ? itemsAgg : (itemsAgg?.length ?? 0);

    // tiny_produtos: total, lastUpdatedAt
    const { data: produtosAgg, error: produtosError } = await supabaseAdmin
      .from('tiny_produtos')
      .select('id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (produtosError) throw produtosError;
    const produtosTotal = produtosAgg?.length ?? 0;
    const produtosLastUpdated = Array.isArray(produtosAgg) && produtosAgg[0]?.updated_at ? produtosAgg[0].updated_at : null;

    // sync_settings: tiny_orders_incremental
    const { data: settingsAgg, error: settingsError } = await supabaseAdmin
      .from('sync_settings')
      .select('tiny_orders_incremental')
      .eq('key', 'tiny_orders_incremental')
      .maybeSingle();
    if (settingsError) throw settingsError;

    const response = {
      orders: {
        total: Number(ordersTyped?.count ?? 0),
        firstDate: ordersTyped?.min ?? null,
        lastDate: ordersTyped?.max ?? null,
      },
      items: {
        total: itemsTotal,
      },
      produtos: {
        total: produtosTotal,
        lastUpdatedAt: produtosLastUpdated,
      },
      settings: {
        tinyOrdersIncremental: (settingsAgg as { tiny_orders_incremental?: any } | null)?.tiny_orders_incremental ?? null,
      },
    };

    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao obter overview de sincronização', details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
