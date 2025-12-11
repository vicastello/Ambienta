import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type GroupBy = 'pedido' | 'sku' | 'canal';
type ViewMode = 'unitario' | 'kit';

interface SalesItem {
  id: string;
  pedido_id: string | number;
  numero_pedido: string | number;
  data: string;
  canal: string;
  sku: string;
  nome_produto: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  tipo_produto?: string;
  is_kit?: boolean;
  kit_parent_sku?: string;
  cliente_nome?: string;
  situacao?: number;
}

interface Summary {
  total_pedidos: number;
  total_itens: number;
  quantidade_total: number;
  faturamento_total: number;
  ticket_medio: number;
  pedidos_nao_vinculados: number;
  pedidos_com_problema: number;
}

interface ByChannel {
  canal: string;
  pedidos: number;
  quantidade: number;
  faturamento: number;
}

interface TopProduct {
  sku: string;
  nome: string;
  quantidade: number;
  faturamento: number;
  pedidos: number;
}

interface PedidoItem {
  id: number;
  id_produto_tiny: number | null;
  codigo_produto: string | null;
  nome_produto: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

interface PedidoRow {
  id: number;
  tiny_id: number;
  numero_pedido: number | null;
  data_criacao: string | null;
  canal: string | null;
  cliente_nome: string | null;
  situacao: number | null;
  valor: number | null;
  numero_pedido_ecommerce: string | null;
  tiny_pedido_itens: PedidoItem[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dataInicio = searchParams.get('dataInicio') || '2025-11-01';
    const dataFim = searchParams.get('dataFim') || new Date().toISOString().split('T')[0];
    const canal = searchParams.get('canal') || 'todos';
    const situacao = searchParams.get('situacao');
    const sku = searchParams.get('sku');
    const groupBy = (searchParams.get('groupBy') || 'sku') as GroupBy;
    const viewMode = (searchParams.get('viewMode') || 'unitario') as ViewMode;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Base query para pedidos
    let pedidosQuery = supabaseAdmin
      .from('tiny_orders')
      .select(`
        id,
        tiny_id,
        numero_pedido,
        data_criacao,
        canal,
        cliente_nome,
        situacao,
        valor,
        numero_pedido_ecommerce,
        tiny_pedido_itens (
          id,
          id_produto_tiny,
          codigo_produto,
          nome_produto,
          quantidade,
          valor_unitario,
          valor_total
        )
      `)
      .gte('data_criacao', dataInicio)
      .lte('data_criacao', dataFim)
      .order('data_criacao', { ascending: false });

    // Filtro por canal
    if (canal && canal !== 'todos') {
      pedidosQuery = pedidosQuery.ilike('canal', `%${canal}%`);
    }

    // Filtro por situação
    if (situacao) {
      pedidosQuery = pedidosQuery.eq('situacao', parseInt(situacao));
    }

    const { data: pedidos, error: pedidosError } = await pedidosQuery;

    if (pedidosError) {
      console.error('Erro ao buscar pedidos:', pedidosError);
      return NextResponse.json({ success: false, error: pedidosError.message }, { status: 500 });
    }


    // Buscar info de produtos (tipo)
    const { data: produtos } = await supabaseAdmin
      .from('tiny_produtos')
      .select('codigo, nome, tipo');
    const produtoMap = new Map(produtos?.map(p => [p.codigo, { nome: p.nome, tipo: p.tipo }]) || []);

    // Buscar vínculos de pedidos marketplace <-> tiny
    const { data: orderLinks } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('marketplace, marketplace_order_id, tiny_order_id');
    const orderLinkMap = new Map();
    (orderLinks || []).forEach(link => {
      orderLinkMap.set(link.tiny_order_id, link);
    });

    // Buscar vínculos de kits do marketplace
    const { data: kitComponents } = await supabaseAdmin
      .from('marketplace_kit_components')
      .select('marketplace, marketplace_sku, component_sku, component_qty');
    // Agrupar por (marketplace, marketplace_sku)
    const kitMap = new Map();
    (kitComponents || []).forEach(row => {
      const key = `${row.marketplace}||${row.marketplace_sku}`;
      if (!kitMap.has(key)) kitMap.set(key, []);
      kitMap.get(key).push({ sku: row.component_sku, qty: Number(row.component_qty) });
    });

    // Processar itens
    const items: SalesItem[] = [];
    let pedidosNaoVinculados = 0;
    let pedidosComProblema = 0;
    const pedidosSet = new Set<string | number>();
    const canaisMap = new Map<string, { pedidos: Set<string | number>; quantidade: number; faturamento: number }>();
    const skuMap = new Map<string, { nome: string; quantidade: number; faturamento: number; pedidos: Set<string | number> }>();

    for (const pedido of (pedidos || []) as unknown as PedidoRow[]) {
      const pedidoItens = pedido.tiny_pedido_itens || [];
      // Verificar vinculação
      const link = orderLinkMap.get(pedido.id);
      if (!link && pedido.canal && (
        pedido.canal.toLowerCase().includes('magalu') ||
        pedido.canal.toLowerCase().includes('shopee') ||
        pedido.canal.toLowerCase().includes('mercado'))
      ) {
        pedidosNaoVinculados++;
      }
      // Verificar problemas (pedido sem itens)
      if (pedidoItens.length === 0) {
        pedidosComProblema++;
      }

      // Se modo kit, tentar identificar kits vendidos via vínculo
      if (viewMode === 'kit' && link) {
        // Para cada kit do marketplace, verificar se os componentes batem com os itens do pedido Tiny
        for (const [kitKey, components] of kitMap.entries()) {
          // Checar se todos os componentes do kit estão presentes no pedido Tiny nas quantidades corretas
          let kitQtd = Infinity;
          for (const comp of components) {
            const found = pedidoItens.find(i => i.codigo_produto === comp.sku);
            if (!found) { kitQtd = 0; break; }
            kitQtd = Math.min(kitQtd, Math.floor(found.quantidade / comp.qty));
          }
          if (kitQtd > 0 && kitQtd !== Infinity) {
            // Encontrou kit vendido
            const [marketplace, marketplace_sku] = kitKey.split('||');
            // Nome do kit: pode buscar do produtoMap se mapeado
            const prodInfo = produtoMap.get(marketplace_sku) || { nome: marketplace_sku, tipo: 'K' };
            items.push({
              id: `${pedido.id}-KIT-${marketplace_sku}`,
              pedido_id: pedido.id,
              numero_pedido: pedido.numero_pedido || pedido.tiny_id,
              data: pedido.data_criacao || '',
              canal: normalizeCanal(pedido.canal),
              sku: marketplace_sku,
              nome_produto: prodInfo.nome,
              quantidade: kitQtd,
              valor_unitario: pedido.valor ? pedido.valor / kitQtd : 0,
              valor_total: pedido.valor || 0,
              tipo_produto: 'K',
              is_kit: true,
              cliente_nome: pedido.cliente_nome || '',
              situacao: pedido.situacao ?? undefined,
            });
            pedidosSet.add(pedido.id);
            updateCanalMap(canaisMap, normalizeCanal(pedido.canal), pedido.id, kitQtd, pedido.valor || 0);
            updateSkuMap(skuMap, marketplace_sku, prodInfo.nome, kitQtd, pedido.valor || 0, pedido.id);
          }
        }
        continue; // Não processa itens individuais se modo kit
      }

      // Modo unitário (ou pedido sem vínculo de kit)
      pedidoItens.forEach((item) => {
        const skuOriginal = item.codigo_produto || '';
        // Filtro por SKU
        if (sku && !skuOriginal.toLowerCase().includes(sku.toLowerCase())) {
          return;
        }
        const prodInfo = produtoMap.get(skuOriginal);
        const isKit = prodInfo?.tipo === 'K';
        if (viewMode === 'kit' && !isKit) {
          return; // Pula produtos que não são kits
        }
        // Item normal (ou kit mantido como kit)
        items.push({
          id: `${pedido.id}-${item.id}`,
          pedido_id: pedido.id,
          numero_pedido: pedido.numero_pedido || pedido.tiny_id,
          data: pedido.data_criacao || '',
          canal: normalizeCanal(pedido.canal),
          sku: skuOriginal,
          nome_produto: item.nome_produto,
          quantidade: item.quantidade,
          valor_unitario: item.valor_unitario,
          valor_total: item.valor_total,
          tipo_produto: prodInfo?.tipo || 'S',
          is_kit: isKit,
          cliente_nome: pedido.cliente_nome || '',
          situacao: pedido.situacao ?? undefined,
        });
        pedidosSet.add(pedido.id);
        updateCanalMap(canaisMap, normalizeCanal(pedido.canal), pedido.id, item.quantidade, item.valor_total);
        updateSkuMap(skuMap, skuOriginal, item.nome_produto, item.quantidade, item.valor_total, pedido.id);
      });
    }

    // Calcular resumo
    const faturamentoTotal = items.reduce((sum, i) => sum + i.valor_total, 0);
    const quantidadeTotal = items.reduce((sum, i) => sum + i.quantidade, 0);
    
    const summary: Summary = {
      total_pedidos: pedidosSet.size,
      total_itens: items.length,
      quantidade_total: quantidadeTotal,
      faturamento_total: faturamentoTotal,
      ticket_medio: pedidosSet.size > 0 ? faturamentoTotal / pedidosSet.size : 0,
      pedidos_nao_vinculados: pedidosNaoVinculados,
      pedidos_com_problema: pedidosComProblema,
    };

    // Por canal
    const byChannel: ByChannel[] = Array.from(canaisMap.entries()).map(([canal, data]) => ({
      canal,
      pedidos: data.pedidos.size,
      quantidade: data.quantidade,
      faturamento: data.faturamento,
    })).sort((a, b) => b.faturamento - a.faturamento);

    // Top produtos
    const topProducts: TopProduct[] = Array.from(skuMap.entries())
      .map(([sku, data]) => ({
        sku,
        nome: data.nome,
        quantidade: data.quantidade,
        faturamento: data.faturamento,
        pedidos: data.pedidos.size,
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 20);

    // Agrupar dados conforme groupBy
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let groupedData: any[] = [];
    
    if (groupBy === 'pedido') {
      // Agrupar por pedido
      const pedidoMap = new Map<string | number, SalesItem[]>();
      items.forEach(item => {
        if (!pedidoMap.has(item.pedido_id)) {
          pedidoMap.set(item.pedido_id, []);
        }
        pedidoMap.get(item.pedido_id)!.push(item);
      });
      
      groupedData = Array.from(pedidoMap.entries()).map(([pedidoId, pedidoItems]) => ({
        pedido_id: pedidoId,
        numero_pedido: pedidoItems[0].numero_pedido,
        data: pedidoItems[0].data,
        canal: pedidoItems[0].canal,
        cliente_nome: pedidoItems[0].cliente_nome,
        situacao: pedidoItems[0].situacao,
        itens: pedidoItems.length,
        quantidade_total: pedidoItems.reduce((s, i) => s + i.quantidade, 0),
        valor_total: pedidoItems.reduce((s, i) => s + i.valor_total, 0),
        items: pedidoItems,
      }));
    } else if (groupBy === 'canal') {
      groupedData = byChannel.map(c => ({
        ...c,
        ticket_medio: c.pedidos > 0 ? c.faturamento / c.pedidos : 0,
      }));
    } else {
      // groupBy === 'sku'
      groupedData = topProducts;
    }

    // Paginação
    const totalItems = groupedData.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedData = groupedData.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      success: true,
      summary,
      byChannel,
      topProducts,
      data: paginatedData,
      items: items.slice(0, 1000), // Limitar items raw para exportação
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
      },
      filters: {
        dataInicio,
        dataFim,
        canal,
        situacao,
        sku,
        groupBy,
        viewMode,
      },
    });
  } catch (error) {
    console.error('Erro no relatório de vendas:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

function normalizeCanal(canal: string | null): string {
  if (!canal) return 'Direto';
  const c = canal.toLowerCase();
  if (c.includes('magalu') || c.includes('magazine')) return 'Magalu';
  if (c.includes('shopee')) return 'Shopee';
  if (c.includes('mercado') || c.includes('meli')) return 'Mercado Livre';
  if (c.includes('tiny') || c.includes('loja')) return 'Loja Própria';
  return canal;
}

function updateCanalMap(
  map: Map<string, { pedidos: Set<string | number>; quantidade: number; faturamento: number }>,
  canal: string,
  pedidoId: string | number,
  quantidade: number,
  valor: number
) {
  if (!map.has(canal)) {
    map.set(canal, { pedidos: new Set(), quantidade: 0, faturamento: 0 });
  }
  const data = map.get(canal)!;
  data.pedidos.add(pedidoId);
  data.quantidade += quantidade;
  data.faturamento += valor;
}

function updateSkuMap(
  map: Map<string, { nome: string; quantidade: number; faturamento: number; pedidos: Set<string | number> }>,
  sku: string,
  nome: string,
  quantidade: number,
  valor: number,
  pedidoId: string | number
) {
  if (!map.has(sku)) {
    map.set(sku, { nome, quantidade: 0, faturamento: 0, pedidos: new Set() });
  }
  const data = map.get(sku)!;
  data.quantidade += quantidade;
  data.faturamento += valor;
  data.pedidos.add(pedidoId);
}
