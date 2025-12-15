import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type TinyOrderRowLite = {
  id: number;
  tiny_id?: number | null;
  numero_pedido?: number | string | null;
  data_criacao?: string | null;
  canal?: string | null;
  cliente_nome?: string | null;
  situacao?: number | null;
  valor?: number | null;
  numero_pedido_ecommerce?: string | null;
  valor_total_pedido?: number | null;
  valor_total_produtos?: number | null;
  valor_desconto?: number | null;
  raw_payload?: unknown;
};

type TinyPedidoItemRowLite = {
  id: number;
  id_pedido: number;
  id_produto_tiny: number | null;
  codigo_produto: string | null;
  nome_produto: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  tiny_orders?: {
    data_criacao?: string | null;
    canal?: string | null;
    situacao?: number | null;
  };
};

type MarketplaceOrderLinkRowLite = {
  marketplace: string;
  marketplace_order_id: string;
  tiny_order_id: number;
};

type MarketplaceKitComponentRowLite = {
  marketplace: string;
  marketplace_sku: string;
  component_sku: string;
  component_qty: number | string;
};

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
  custo_embalagens_total?: number;
}

interface ByChannel {
  canal: string;
  pedidos: number;
  quantidade: number;
  faturamento: number;
}

interface TopProduct {
  produto_id?: number;
  sku: string;
  nome: string;
  quantidade: number;
  faturamento: number;
  pedidos: number;
  custo_embalagens?: number;
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dataInicio = searchParams.get('dataInicio') || '2025-11-01';
    const dataFim = searchParams.get('dataFim') || new Date().toISOString().split('T')[0];
    const canal = searchParams.get('canal') || 'todos';
    const situacao = searchParams.get('situacao');
    const situacoesParam = searchParams.get('situacoes');
    const sku = searchParams.get('sku');
    const groupBy = (searchParams.get('groupBy') || 'sku') as GroupBy;
    const viewMode = (searchParams.get('viewMode') || 'unitario') as ViewMode;
    const page = parseInt(searchParams.get('page') || '1');
    const limitRaw = searchParams.get('limit');
    const limit = parseInt(limitRaw || '50');
    const noPagination = !limitRaw || limit <= 0;

    // Buscar TODOS os pedidos usando paginação (Supabase limita em 1000 por query)
    const allPedidos: TinyOrderRowLite[] = [];
    let currentPage = 0;
    const pageSize = 1000;

    while (true) {
      let pedidosQuery = supabaseAdmin
        .from('tiny_orders')
        .select('id, tiny_id, numero_pedido, data_criacao, canal, cliente_nome, situacao, valor, numero_pedido_ecommerce, valor_total_pedido, valor_total_produtos, valor_desconto, raw_payload')
        .gte('data_criacao', dataInicio)
        .lte('data_criacao', dataFim)
        .order('data_criacao', { ascending: false })
        .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

      // Filtro por canal
      if (canal && canal !== 'todos') {
        pedidosQuery = pedidosQuery.ilike('canal', `%${canal}%`);
      }

      // Filtro por situação
      const situacoes: number[] = [];
      if (situacoesParam) {
        situacoesParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((s) => {
            const n = Number(s);
            if (Number.isFinite(n)) situacoes.push(n);
          });
      } else if (situacao) {
        const n = Number(situacao);
        if (Number.isFinite(n)) situacoes.push(n);
      }
      if (situacoes.length > 0) {
        pedidosQuery = pedidosQuery.in('situacao', situacoes);
      }

      const { data: pedidosPage, error: pedidosError } = await pedidosQuery;

      if (pedidosError) {
        console.error('Erro ao buscar pedidos:', pedidosError);
        return NextResponse.json({ success: false, error: pedidosError.message }, { status: 500 });
      }

      if (!pedidosPage || pedidosPage.length === 0) break;

      allPedidos.push(...((pedidosPage as unknown as TinyOrderRowLite[]) || []));

      if (pedidosPage.length < pageSize) break; // Última página
      currentPage++;
    }

    const pedidos = allPedidos;

    // Buscar itens dos pedidos com paginação usando join no intervalo (evita perder itens por chunking do .in)
    const allItens: TinyPedidoItemRowLite[] = [];
    {
      const pageSizeItems = 1000;
      let from = 0;
      while (true) {
        let itensQuery = supabaseAdmin
          .from('tiny_pedido_itens')
          .select('id, id_pedido, id_produto_tiny, codigo_produto, nome_produto, quantidade, valor_unitario, valor_total, tiny_orders!inner(data_criacao, canal, situacao)')
          .gte('tiny_orders.data_criacao', dataInicio)
          .lte('tiny_orders.data_criacao', dataFim)
          .range(from, from + pageSizeItems - 1);

        // Filtro por canal (mesmo usado nos pedidos)
        if (canal && canal !== 'todos') {
          itensQuery = itensQuery.ilike('tiny_orders.canal', `%${canal}%`);
        }
        // Filtro por situação (mesmo usado nos pedidos)
        const situacoes: number[] = [];
        if (situacoesParam) {
          situacoesParam
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((s) => {
              const n = Number(s);
              if (Number.isFinite(n)) situacoes.push(n);
            });
        } else if (situacao) {
          const n = Number(situacao);
          if (Number.isFinite(n)) situacoes.push(n);
        }
        if (situacoes.length > 0) {
          itensQuery = itensQuery.in('tiny_orders.situacao', situacoes);
        }

        const { data: itensChunk, error: itensError } = await itensQuery;
        if (itensError) {
          console.error('Erro ao buscar itens:', itensError);
          return NextResponse.json({ success: false, error: itensError.message }, { status: 500 });
        }
        if (!itensChunk || itensChunk.length === 0) break;
        allItens.push(...((itensChunk as unknown as TinyPedidoItemRowLite[]) || []));
        if (itensChunk.length < pageSizeItems) break;
        from += pageSizeItems;
      }
    }

    // Criar mapa de itens por pedido
    const itensMap = new Map<number, PedidoItem[]>();
    allItens.forEach((item) => {
      if (!itensMap.has(item.id_pedido)) {
        itensMap.set(item.id_pedido, []);
      }
      itensMap.get(item.id_pedido)!.push({
        id: item.id,
        id_produto_tiny: item.id_produto_tiny,
        codigo_produto: item.codigo_produto,
        nome_produto: item.nome_produto,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        valor_total: item.valor_total,
      });
    });

    // Buscar info de produtos (tipo) apenas para SKUs presentes nos itens do período
    const usedSkus = Array.from(
      new Set(
        allItens
          .map((i) => i.codigo_produto)
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
      )
    );

    type TinyProdutoLite = {
      id: number;
      codigo: string | null;
      nome: string;
      tipo: string | null;
    };

    const produtos: TinyProdutoLite[] = [];
    {
      const chunkSize = 1000;
      for (let i = 0; i < usedSkus.length; i += chunkSize) {
        const chunk = usedSkus.slice(i, i + chunkSize);
        const { data, error } = await supabaseAdmin
          .from('tiny_produtos')
          .select('id, codigo, nome, tipo')
          .in('codigo', chunk);
        if (error) {
          console.error('Erro ao buscar produtos:', error);
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        if (data?.length) produtos.push(...(data as unknown as TinyProdutoLite[]));
      }
    }

    const produtoMap = new Map(
      produtos
        .filter((p) => !!p.codigo)
        .map((p) => [p.codigo as string, { id: p.id, nome: p.nome, tipo: p.tipo }])
    );


    // Buscar vínculos de pedidos marketplace <-> tiny em chunks
    const allOrderLinks: MarketplaceOrderLinkRowLite[] = [];
    const pedidoIds = pedidos.map((p) => p.id);
    const chunkSize = 1000;
    for (let i = 0; i < pedidoIds.length; i += chunkSize) {
      const chunk = pedidoIds.slice(i, i + chunkSize);
      let from = 0;
      const pageSizeLinks = 1000;
      while (true) {
        const { data: linksChunk, error: linksError } = await supabaseAdmin
          .from('marketplace_order_links')
          .select('marketplace, marketplace_order_id, tiny_order_id')
          .in('tiny_order_id', chunk)
          .range(from, from + pageSizeLinks - 1);

        if (linksError) {
          console.error('Erro ao buscar vínculos de pedidos:', linksError);
          return NextResponse.json({ success: false, error: linksError.message }, { status: 500 });
        }

        if (!linksChunk || linksChunk.length === 0) break;
        allOrderLinks.push(...((linksChunk as unknown as MarketplaceOrderLinkRowLite[]) || []));
        if (linksChunk.length < pageSizeLinks) break;
        from += pageSizeLinks;
      }
    }

    const orderLinkMap = new Map<number, MarketplaceOrderLinkRowLite>();
    allOrderLinks.forEach((link) => {
      orderLinkMap.set(link.tiny_order_id, link);
    });

    // Buscar vínculos de kits do marketplace (paginado)
    const kitComponents: MarketplaceKitComponentRowLite[] = [];
    {
      const pageSizeKits = 1000;
      let from = 0;
      while (true) {
        const { data: kitsChunk, error: kitsError } = await supabaseAdmin
          .from('marketplace_kit_components')
          .select('marketplace, marketplace_sku, component_sku, component_qty')
          .range(from, from + pageSizeKits - 1);
        if (kitsError) {
          console.error('Erro ao buscar kits:', kitsError);
          return NextResponse.json({ success: false, error: kitsError.message }, { status: 500 });
        }
        if (!kitsChunk || kitsChunk.length === 0) break;
        kitComponents.push(...((kitsChunk as unknown as MarketplaceKitComponentRowLite[]) || []));
        if (kitsChunk.length < pageSizeKits) break;
        from += pageSizeKits;
      }
    }
    // Agrupar por (marketplace, marketplace_sku)
    const kitMap = new Map<string, Array<{ sku: string; qty: number }>>();
    kitComponents.forEach((row) => {
      const key = `${row.marketplace}||${row.marketplace_sku}`;
      if (!kitMap.has(key)) kitMap.set(key, []);
      kitMap.get(key)!.push({ sku: row.component_sku, qty: Number(row.component_qty) });
    });

    // Buscar itens do marketplace (SKU original do pedido) para poder expandir kits a partir do SKU do marketplace
    const orderItemsMap = new Map<number, { sku: string; name: string; quantity: number; price: number | null }[]>();
    // Agrupar order_ids por marketplace
    const shopeeOrders: string[] = [];
    const magaluOrders: string[] = [];
    const meliOrders: string[] = [];
    allOrderLinks.forEach(l => {
      if (l.marketplace === 'shopee') shopeeOrders.push(l.marketplace_order_id);
      else if (l.marketplace === 'magalu') magaluOrders.push(l.marketplace_order_id);
      else if (l.marketplace === 'mercado_livre') meliOrders.push(l.marketplace_order_id);
    });
    // Helper para inserir no map
    const seenOrderItems = new Map<number, Set<string>>();
    const pushOrderItems = (tinyOrderId: number, items: { sku: string; name: string; quantity: number; price: number | null }[]) => {
      if (!orderItemsMap.has(tinyOrderId)) orderItemsMap.set(tinyOrderId, []);
      orderItemsMap.get(tinyOrderId)!.push(...items);
      // marca para deduplicar por (sku,price)
      const set = seenOrderItems.get(tinyOrderId) || new Set<string>();
      items.forEach(it => {
        const key = `${it.sku}||${it.price ?? 'na'}`;
        set.add(key);
      });
      seenOrderItems.set(tinyOrderId, set);
    };
    // Shopee
    const fetchShopee = async (ids: string[]) => {
      const chunkSizeOrders = 500;
      for (let i = 0; i < ids.length; i += chunkSizeOrders) {
        const chunk = ids.slice(i, i + chunkSizeOrders);
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabaseAdmin
            .from('shopee_order_items')
            .select('order_sn, item_name, item_sku, model_sku, quantity, original_price, discounted_price')
            .in('order_sn', chunk)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          data.forEach(row => {
            const sku = row.model_sku || row.item_sku || '';
            const price = row.discounted_price ?? row.original_price ?? null;
            // descobrir tiny_order_id a partir do link
            const link = allOrderLinks.find(l => l.marketplace === 'shopee' && l.marketplace_order_id === row.order_sn);
            if (link) {
              const key = `${sku}||${price ?? 'na'}`;
              const seen = seenOrderItems.get(link.tiny_order_id) || new Set<string>();
              if (!seen.has(key)) {
                pushOrderItems(link.tiny_order_id, [{
                  sku,
                  name: row.item_name || sku,
                  quantity: Number(row.quantity || 0),
                  price,
                }]);
                seen.add(key);
                seenOrderItems.set(link.tiny_order_id, seen);
              }
            }
          });
          if (data.length < pageSize) break;
          from += pageSize;
        }
      }
    };
    // Magalu
    const fetchMagalu = async (ids: string[]) => {
      const chunkSizeOrders = 500;
      for (let i = 0; i < ids.length; i += chunkSizeOrders) {
        const chunk = ids.slice(i, i + chunkSizeOrders);
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabaseAdmin
            .from('magalu_order_items')
            .select('id_order, id_sku, product_name, quantity, price, discount')
            .in('id_order', chunk)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          data.forEach(row => {
            const price = typeof row.price === 'number' ? row.price : Number(row.price) || null;
            const link = allOrderLinks.find(l => l.marketplace === 'magalu' && l.marketplace_order_id === row.id_order);
            if (link) {
              const sku = String(row.id_sku ?? '');
              const key = `${sku}||${price ?? 'na'}`;
              const seen = seenOrderItems.get(link.tiny_order_id) || new Set<string>();
              if (!seen.has(key)) {
                pushOrderItems(link.tiny_order_id, [{
                  sku,
                  name: String((row as { product_name?: unknown }).product_name ?? row.id_sku ?? ''),
                  quantity: Number(row.quantity || 0),
                  price,
                }]);
                seen.add(key);
                seenOrderItems.set(link.tiny_order_id, seen);
              }
            }
          });
          if (data.length < pageSize) break;
          from += pageSize;
        }
      }
    };
    // Mercado Livre
    const fetchMeli = async (ids: string[]) => {
      const chunkSizeOrders = 500;
      for (let i = 0; i < ids.length; i += chunkSizeOrders) {
        const chunk = ids.slice(i, i + chunkSizeOrders);
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabaseAdmin
            .from('meli_order_items')
            .select('meli_order_id, sku, title, quantity, unit_price')
            .in('meli_order_id', chunk.map(id => Number(id)))
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          data.forEach(row => {
            const link = allOrderLinks.find(l => l.marketplace === 'mercado_livre' && l.marketplace_order_id === String(row.meli_order_id));
            if (link) {
              const sku = row.sku || '';
              const price = typeof row.unit_price === 'number' ? row.unit_price : Number(row.unit_price) || null;
              const key = `${sku}||${price ?? 'na'}`;
              const seen = seenOrderItems.get(link.tiny_order_id) || new Set<string>();
              if (!seen.has(key)) {
                pushOrderItems(link.tiny_order_id, [{
                  sku,
                  name: row.title || row.sku || '',
                  quantity: Number(row.quantity || 0),
                  price,
                }]);
                seen.add(key);
                seenOrderItems.set(link.tiny_order_id, seen);
              }
            }
          });
          if (data.length < pageSize) break;
          from += pageSize;
        }
      }
    };
    if (shopeeOrders.length) await fetchShopee(shopeeOrders);
    if (magaluOrders.length) await fetchMagalu(magaluOrders);
    if (meliOrders.length) await fetchMeli(meliOrders);

    // Carregar produtos adicionais (SKUs vindos do marketplace) para permitir:
    // - identificar tipo/nome
    // - obter produto_id para editar embalagens
    // - calcular custo de embalagens do kit pelo SKU do kit
    {
      const marketplaceSkus = Array.from(
        new Set(
          Array.from(orderItemsMap.values())
            .flat()
            .map((it) => it.sku)
            .filter((v): v is string => typeof v === 'string' && v.length > 0)
        )
      );
      const missingSkus = marketplaceSkus.filter((s) => !produtoMap.has(s));
      if (missingSkus.length > 0) {
        const chunkSize = 1000;
        for (let i = 0; i < missingSkus.length; i += chunkSize) {
          const chunk = missingSkus.slice(i, i + chunkSize);
          const { data, error } = await supabaseAdmin
            .from('tiny_produtos')
            .select('id, codigo, nome, tipo')
            .in('codigo', chunk);
          if (error) {
            console.error('Erro ao buscar produtos (marketplace SKUs):', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
          }
          const extra = (data || []) as unknown as TinyProdutoLite[];
          if (extra.length) {
            produtos.push(...extra);
            extra.forEach((p) => {
              if (p.codigo) {
                produtoMap.set(p.codigo, { id: p.id, nome: p.nome, tipo: p.tipo });
              }
            });
          }
        }
      }
    }

    // Calcular custo de embalagens por SKU (custo por unidade vendida)
    // Fonte: produto_embalagens.quantidade × embalagens.preco_unitario
    const embalagemCostBySku = new Map<string, number>();
    {
      const produtoIds = Array.from(new Set(produtos.map((p) => p.id)));
      if (produtoIds.length > 0) {
        type ProdutoEmbalagemRow = {
          produto_id: number;
          quantidade: number | string;
          embalagem: { preco_unitario: number | string } | null;
        };

        const baseCostByProdutoId = new Map<number, number>();
        const chunkSize = 1000;
        for (let i = 0; i < produtoIds.length; i += chunkSize) {
          const chunk = produtoIds.slice(i, i + chunkSize);
          const { data, error } = await supabaseAdmin
            .from('produto_embalagens')
            .select('produto_id, quantidade, embalagem:embalagens(preco_unitario)')
            .in('produto_id', chunk);
          if (error) {
            console.error('Erro ao buscar vínculos de embalagens:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
          }

          for (const row of (data || []) as unknown as ProdutoEmbalagemRow[]) {
            const qty = typeof row.quantidade === 'number' ? row.quantidade : Number(row.quantidade) || 0;
            const unit = row.embalagem
              ? (typeof row.embalagem.preco_unitario === 'number'
                ? row.embalagem.preco_unitario
                : Number(row.embalagem.preco_unitario) || 0)
              : 0;
            const current = baseCostByProdutoId.get(row.produto_id) || 0;
            baseCostByProdutoId.set(row.produto_id, current + qty * unit);
          }
        }

        const produtoIdToSku = new Map<number, string>();
        for (const p of produtos) {
          if (!p.codigo) continue;
          produtoIdToSku.set(p.id, p.codigo);
        }

        for (const [produtoId, baseCost] of baseCostByProdutoId.entries()) {
          const sku = produtoIdToSku.get(produtoId);
          if (!sku) continue;
          const rounded = Math.round((baseCost + Number.EPSILON) * 100) / 100;
          embalagemCostBySku.set(sku, rounded);
        }
      }
    }

    // Processar itens
    const items: SalesItem[] = [];
    let pedidosNaoVinculados = 0;
    let pedidosComProblema = 0;
    const pedidosSet = new Set<string | number>();
    const canaisMap = new Map<string, { pedidos: Set<string | number>; quantidade: number; faturamento: number }>();
    const skuMap = new Map<
      string,
      { nome: string; quantidade: number; faturamento: number; pedidos: Set<string | number>; custo_embalagens: number }
    >();

    for (const pedido of pedidos) {
      const pedidoItensRaw = itensMap.get(pedido.id) || [];
      // Mantemos os valores originais do Tiny (não normalizamos pelo total do pedido para não mascarar diferenças com o marketplace)
      const pedidoItensValorAjustado = pedidoItensRaw;

      // Mapa de preços do marketplace para este pedido (prioridade para valor dos marketplaces)
      const marketplacePriceRemaining = new Map<string, { qtd: number; price: number }[]>();
      const orderItems = orderItemsMap.get(pedido.id) || [];
      for (const oi of orderItems) {
        const price = oi.price != null ? Number(oi.price) : null;
        const qty = Number(oi.quantity || 0);
        const skuMarket = oi.sku || '';
        if (price != null && price > 0 && qty > 0 && skuMarket) {
          if (!marketplacePriceRemaining.has(skuMarket)) marketplacePriceRemaining.set(skuMarket, []);
          marketplacePriceRemaining.get(skuMarket)!.push({ qtd: qty, price });
        }
      }
      // Deduplica itens iguais (mesmo SKU e valor unitário) somando quantidades/valor_total
      const pedidoItens = mergePedidoItens(pedidoItensValorAjustado);
      // Verificar vinculação
      const link = orderLinkMap.get(pedido.id);
      if (!link && pedido.canal && (
        pedido.canal.toLowerCase().includes('magalu') ||
        pedido.canal.toLowerCase().includes('shopee') ||
        pedido.canal.toLowerCase().includes('mercado'))
      ) {
        pedidosNaoVinculados++;
      }
      // Verificar problemas (pedido sem itens) — só conta Tiny
      if (pedidoItens.length === 0) {
        pedidosComProblema++;
      }

      // Se modo kit, tentar identificar kits vendidos via SKU do marketplace (melhor fonte)
      const kitsDoMarketplace: Array<{ marketplace_sku: string; nome: string; qtd: number; vt: number; components?: { sku: string; qty: number }[] }> = [];
      const skusCobertosPorKit = new Set<string>(); // mantido para compat, mas vamos usar remainingAfterKits para não descartar sobras
      let remainingAfterKits: Map<string, { qtd: number; vu: number }[]> | null = null;
      const tinyItemBySku = new Map<string, { quantidade: number; valor_unitario: number; valor_total: number }>();
      pedidoItens.forEach(it => {
        const key = it.codigo_produto || '';
        tinyItemBySku.set(key, {
          quantidade: Number(it.quantidade || 0),
          valor_unitario: Number(it.valor_unitario || 0),
          valor_total: Number(it.valor_total || 0),
        });
      });

      if (viewMode === 'kit' && link) {
        const canalNorm = (pedido.canal || '').toLowerCase();
        let marketplaceForOrder: string | null = null;
        if (canalNorm.includes('shopee')) marketplaceForOrder = 'shopee';
        else if (canalNorm.includes('magalu') || canalNorm.includes('magazine')) marketplaceForOrder = 'magalu';
        else if (canalNorm.includes('mercado') || canalNorm.includes('meli')) marketplaceForOrder = 'mercado_livre';

        const orderItems = orderItemsMap.get(pedido.id);
        if (orderItems && orderItems.length > 0) {
          for (const oi of orderItems) {
            const kitKey = marketplaceForOrder ? `${marketplaceForOrder}||${oi.sku}` : null;
            if (!kitKey || !kitMap.has(kitKey)) {
              continue; // item de marketplace que não é kit
            }
            const components = kitMap.get(kitKey) as { sku: string; qty: number }[];
            const prodInfo = produtoMap.get(oi.sku) || { nome: oi.name || oi.sku, tipo: 'K' };
            const qtdKit = Number(oi.quantity || 0);
            const valorTotal = (oi.price ?? 0) * qtdKit;
            kitsDoMarketplace.push({
              marketplace_sku: oi.sku,
              nome: prodInfo.nome,
              qtd: qtdKit,
              vt: valorTotal,
              components,
            });
          }
        }

        // Se já temos itens do marketplace para este pedido, usamos eles como fonte de verdade em modo kit.
        if (orderItems && orderItems.length > 0) {
          const agg = new Map<string, { sku: string; nome: string; qtd: number; price: number; isKit: boolean }>();
          for (const oi of orderItems) {
            const price = oi.price != null ? Number(oi.price) : undefined;
            const nome = (produtoMap.get(oi.sku)?.nome) || oi.name || oi.sku;
            const key = `${oi.sku}||${price ?? 'na'}`;
            const isKit = marketplaceForOrder ? kitMap.has(`${marketplaceForOrder}||${oi.sku}`) : false;
            const current = agg.get(key) || { sku: oi.sku, nome, qtd: 0, price: price ?? 0, isKit };
            current.qtd += Number(oi.quantity || 0);
            agg.set(key, current);
          }
          for (const entry of agg.values()) {
            const vt = Math.round(((entry.price || 0) * entry.qtd + Number.EPSILON) * 100) / 100;
            items.push({
              id: `${pedido.id}-MP-${entry.sku}`,
              pedido_id: pedido.id,
              numero_pedido: pedido.numero_pedido ?? pedido.tiny_id ?? pedido.id,
              data: pedido.data_criacao || '',
              canal: normalizeCanal(pedido.canal ?? null),
              sku: entry.sku,
              nome_produto: entry.nome,
              quantidade: entry.qtd,
              valor_unitario: entry.qtd > 0 ? vt / entry.qtd : 0,
              valor_total: vt,
              tipo_produto: entry.isKit ? 'K' : (produtoMap.get(entry.sku)?.tipo || 'S'),
              is_kit: entry.isKit,
              cliente_nome: pedido.cliente_nome || '',
              situacao: pedido.situacao ?? undefined,
            });
            pedidosSet.add(pedido.id);
            updateCanalMap(canaisMap, normalizeCanal(pedido.canal ?? null), pedido.id, entry.qtd, vt);
            // Em modo kit: custo de embalagem do kit deve ser o custo cadastrado NO SKU DO KIT.
            // (Não soma embalagens dos componentes.)
            let custoEmbalagens = (embalagemCostBySku.get(entry.sku) || 0) * entry.qtd;
            custoEmbalagens = Math.round((custoEmbalagens + Number.EPSILON) * 100) / 100;
            updateSkuMap(skuMap, entry.sku, entry.nome, entry.qtd, vt, pedido.id, custoEmbalagens);
          }
          // pula processamento baseado no Tiny (evita transformar unitário em kit)
          continue;
        }

        // fallback: inferir kit a partir dos componentes Tiny (somente se não há itens de marketplace para este pedido)
        if (kitsDoMarketplace.length === 0 && (!orderItems || orderItems.length === 0)) {
          // agrega por SKU somando quantidades e valor_total para calcular vu médio (evita perder preços diferentes do mesmo SKU)
          const itemCountMap = new Map<string, { qtd: number; vu: number; vt: number }>();
          for (const it of pedidoItens) {
            const vu = Number(it.valor_unitario || 0);
            const vt = Number(it.valor_total || 0);
            const key = it.codigo_produto || '';
            const current = itemCountMap.get(key) || { qtd: 0, vu: 0, vt: 0 };
            const newQtd = current.qtd + Number(it.quantidade || 0);
            const newVt = current.vt + vt;
            itemCountMap.set(key, {
              qtd: newQtd,
              vt: newVt,
              vu: newQtd > 0 ? newVt / newQtd : vu,
            });
          }
          const kitsForMarketplace: Array<{
            marketplace: string;
            marketplace_sku: string;
            components: { sku: string; qty: number }[];
          }> = [];
          for (const [kitKey, components] of kitMap.entries()) {
            if (marketplaceForOrder && !kitKey.startsWith(`${marketplaceForOrder}||`)) continue;
            const [marketplace, marketplace_sku] = kitKey.split('||');
            kitsForMarketplace.push({ marketplace, marketplace_sku, components });
          }
          kitsForMarketplace.sort((a, b) => {
            const sumA = a.components.reduce((s, c) => s + Number(c.qty || 0), 0);
            const sumB = b.components.reduce((s, c) => s + Number(c.qty || 0), 0);
            return sumB - sumA;
          });
          for (const kit of kitsForMarketplace) {
            let kitQtd = Infinity;
            for (const comp of kit.components) {
              const entry = itemCountMap.get(comp.sku);
              if (!entry || entry.qtd <= 0) { kitQtd = 0; break; }
              kitQtd = Math.min(kitQtd, Math.floor(entry.qtd / comp.qty));
            }
            if (!kitQtd || kitQtd === Infinity) continue;
            let kitValorTotal = 0;
            for (const comp of kit.components) {
              const entry = itemCountMap.get(comp.sku)!;
              kitValorTotal += (entry.vu || 0) * comp.qty * kitQtd;
            }
            const prodInfo = produtoMap.get(kit.marketplace_sku) || { nome: kit.marketplace_sku, tipo: 'K' };
            kitsDoMarketplace.push({
              marketplace_sku: kit.marketplace_sku,
              nome: prodInfo.nome,
              qtd: kitQtd,
              vt: kitValorTotal,
              components: kit.components,
            });
            kit.components.forEach(c => skusCobertosPorKit.add(c.sku));
            for (const comp of kit.components) {
              const entry = itemCountMap.get(comp.sku)!;
              entry.qtd -= comp.qty * kitQtd;
              if (entry.qtd < 0) entry.qtd = 0;
              itemCountMap.set(comp.sku, entry);
            }
          }
        }

        // Renderiza kits identificados consumindo quantidades dos itens Tiny (evita contar o mesmo componente em múltiplos kits)
        if (kitsDoMarketplace.length > 0) {
          // Mantém as quantidades por SKU e por valor unitário (evita subestimar kits quando há preços diferentes do mesmo SKU)
          const remainingDetailed = new Map<string, { qtd: number; vu: number }[]>();
          pedidoItens.forEach(it => {
            const key = it.codigo_produto || '';
            if (!remainingDetailed.has(key)) remainingDetailed.set(key, []);
            remainingDetailed.get(key)!.push({
              qtd: Number(it.quantidade || 0),
              vu: Number(it.valor_unitario || 0),
            });
          });

          const totalQtyForSku = (sku: string) =>
            (remainingDetailed.get(sku) || []).reduce((s, e) => s + e.qtd, 0);

          const computeCost = (sku: string, needed: number) => {
            const entriesTiny = remainingDetailed.get(sku) || [];
            const totalAvailable = entriesTiny.reduce((s, e) => s + e.qtd, 0);
            if (totalAvailable < needed) return { ok: false, cost: 0 };

            // Usa primeiro o preço do marketplace (não muta)
            const priceEntries = (marketplacePriceRemaining.get(sku) || []).map(e => ({ ...e }));
            let rem = needed;
            let cost = 0;
            for (const pe of priceEntries) {
              if (rem <= 0) break;
              const use = Math.min(pe.qtd, rem);
              cost += use * pe.price;
              rem -= use;
            }
            // Se ainda falta, usa o valor unitário do Tiny
            if (rem > 0) {
              for (const entry of entriesTiny) {
                if (rem <= 0) break;
                const use = Math.min(entry.qtd, rem);
                cost += use * entry.vu;
                rem -= use;
              }
            }
            return { ok: rem <= 0, cost };
          };

          const consume = (sku: string, needed: number) => {
            const entriesTiny = remainingDetailed.get(sku) || [];
            let rem = needed;
            let cost = 0;

            // Primeiro consome dos preços do marketplace
            const priceEntries = marketplacePriceRemaining.get(sku) || [];
            for (const pe of priceEntries) {
              if (rem <= 0) break;
              const use = Math.min(pe.qtd, rem);
              if (use > 0) {
                cost += use * pe.price;
                pe.qtd -= use;
                rem -= use;
              }
            }
            // remove entradas zeradas
            marketplacePriceRemaining.set(sku, priceEntries.filter(e => e.qtd > 0));

            // Depois consome das quantidades do Tiny
            for (const entry of entriesTiny) {
              if (rem <= 0) break;
              const use = Math.min(entry.qtd, rem);
              if (use > 0) {
                cost += use * entry.vu;
                entry.qtd -= use;
                rem -= use;
              }
            }
            return { ok: rem <= 0, cost };
          };

          for (const k of kitsDoMarketplace) {
            if (!k.components || k.components.length === 0) continue;

            // máximo possível com base nos itens do Tiny
            let maxPossible = Infinity;
            k.components.forEach(comp => {
              const totalQtd = totalQtyForSku(comp.sku);
              if (!totalQtd || totalQtd <= 0) {
                maxPossible = 0;
              } else {
                maxPossible = Math.min(maxPossible, Math.floor(totalQtd / comp.qty));
              }
            });
            const desiredQty = k.qtd ?? maxPossible;
            const kitQty = Math.min(desiredQty, maxPossible);
            // Se não conseguimos montar a quantidade desejada, não registrar o kit (deixa os itens avulsos)
            if (!kitQty || kitQty === Infinity || kitQty < desiredQty) continue;

            // calcula valor total a partir dos itens Tiny
            let vt = 0;
            let canPrice = true;
            for (const comp of k.components) {
              const res = computeCost(comp.sku, comp.qty * kitQty);
              if (!res.ok) {
                canPrice = false;
                break;
              }
              vt += res.cost;
            }

            // só registra kit se conseguiu calcular valor a partir dos componentes
            if (!canPrice || vt === 0) continue;

            const vtRounded = Math.round((vt + Number.EPSILON) * 100) / 100;
            const valor_unitario = kitQty > 0 ? vtRounded / kitQty : 0;
            items.push({
              id: `${pedido.id}-KIT-${k.marketplace_sku}`,
              pedido_id: pedido.id,
              numero_pedido: pedido.numero_pedido ?? pedido.tiny_id ?? pedido.id,
              data: pedido.data_criacao || '',
              canal: normalizeCanal(pedido.canal ?? null),
              sku: k.marketplace_sku,
              nome_produto: k.nome,
              quantidade: kitQty,
              valor_unitario,
              valor_total: vtRounded,
              tipo_produto: 'K',
              is_kit: true,
              cliente_nome: pedido.cliente_nome || '',
              situacao: pedido.situacao ?? undefined,
            });
            pedidosSet.add(pedido.id);
            updateCanalMap(canaisMap, normalizeCanal(pedido.canal ?? null), pedido.id, kitQty, vt);
            // Em modo kit: custo de embalagem do kit vem do SKU do kit.
            const custoEmbalagens = Math.round(
              (((embalagemCostBySku.get(k.marketplace_sku) || 0) * kitQty) + Number.EPSILON) * 100
            ) / 100;
            updateSkuMap(skuMap, k.marketplace_sku, k.nome, kitQty, vt, pedido.id, custoEmbalagens);

            // consome quantidades restantes e marca componentes cobertos
            k.components.forEach(comp => {
              const res = consume(comp.sku, comp.qty * kitQty);
              if (!res.ok) {
                // Caso improvável: se falhar, apenas continua; as sobras serão tratadas abaixo.
                return;
              }
              skusCobertosPorKit.add(comp.sku);
            });
          }

          // guarda o restante para uso ao renderizar itens não cobertos (evita descartar sobras de componentes)
          remainingAfterKits = new Map<string, { qtd: number; vu: number }[]>();
          for (const [skuKey, entries] of remainingDetailed.entries()) {
            const left = entries.filter(e => e.qtd > 0);
            if (left.length > 0) {
              remainingAfterKits.set(skuKey, left.map(e => ({ ...e })));
            }
          }
        }
      }

      // Modo unitário (ou pedido sem vínculo de kit)
      pedidoItens.forEach((item) => {
        // Em modo kit, só descarta a quantidade que já foi consumida; inclui sobras se houver.
        if (viewMode === 'kit' && remainingAfterKits) {
          const key = item.codigo_produto || '';
          const entries = remainingAfterKits.get(key) || [];
          const totalDisponivel = entries.reduce((s, e) => s + e.qtd, 0);
          if (totalDisponivel <= 0) return;
          const qtdItem = Number(item.quantidade || 0);
          let qtdParaUsar = Math.min(qtdItem, totalDisponivel);
          if (qtdParaUsar <= 0) return;

          // Primeiro usa preços do marketplace para este SKU, se houver
          const priceEntries = marketplacePriceRemaining.get(key) || [];
          let valorTotal = 0;
          let qtdUsada = 0;
          let pIdx = 0;
          while (qtdParaUsar > 0 && pIdx < priceEntries.length) {
            const pe = priceEntries[pIdx];
            const use = Math.min(pe.qtd, qtdParaUsar);
            if (use > 0) {
              valorTotal += use * pe.price;
              pe.qtd -= use;
              qtdParaUsar -= use;
              qtdUsada += use;
            }
            if (pe.qtd <= 0) pIdx++;
          }
          // Remove entradas zeradas
          marketplacePriceRemaining.set(key, priceEntries.filter(e => e.qtd > 0));

          // Se ainda falta, usa valores do Tiny (vu)
          let eIdx = 0;
          while (qtdParaUsar > 0 && eIdx < entries.length) {
            const entry = entries[eIdx];
            const use = Math.min(entry.qtd, qtdParaUsar);
            if (use > 0) {
              valorTotal += use * entry.vu;
              entry.qtd -= use;
              qtdParaUsar -= use;
              qtdUsada += use;
            }
            if (entry.qtd <= 0) eIdx++;
          }

          // Limpa entradas zeradas
          const rest = entries.filter(e => e.qtd > 0);
          if (rest.length > 0) remainingAfterKits.set(key, rest);
          else remainingAfterKits.delete(key);

          if (qtdUsada <= 0) return;
          const vtUsado = Math.round((valorTotal + Number.EPSILON) * 100) / 100;
          item = {
            ...item,
            quantidade: qtdUsada,
            valor_total: vtUsado,
            valor_unitario: Math.round((vtUsado / qtdUsada + Number.EPSILON) * 100) / 100,
          };
        }
        const skuOriginal = item.codigo_produto || '';
        // Filtro por SKU
        if (sku && !skuOriginal.toLowerCase().includes(sku.toLowerCase())) {
          return;
        }
        const prodInfo = produtoMap.get(skuOriginal);
        const isKit = prodInfo?.tipo === 'K';
        // Item normal (ou kit mantido como kit). Em modo kit, itens não cobertos (ou sobras de componentes) continuam aparecendo.
        items.push({
          id: `${pedido.id}-${item.id}`,
          pedido_id: pedido.id,
          numero_pedido: pedido.numero_pedido ?? pedido.tiny_id ?? pedido.id,
          data: pedido.data_criacao || '',
          canal: normalizeCanal(pedido.canal ?? null),
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
        updateCanalMap(canaisMap, normalizeCanal(pedido.canal ?? null), pedido.id, item.quantidade, item.valor_total);
        const custoEmbalagens = Math.round(
          (((embalagemCostBySku.get(skuOriginal) || 0) * Number(item.quantidade || 0)) + Number.EPSILON) * 100
        ) / 100;
        updateSkuMap(skuMap, skuOriginal, item.nome_produto, item.quantidade, item.valor_total, pedido.id, custoEmbalagens);
      });

    }

    // Calcular resumo
    const faturamentoTotal = items.reduce((sum, i) => sum + i.valor_total, 0);
    const quantidadeTotal = items.reduce((sum, i) => sum + i.quantidade, 0);
    const totalPedidos = pedidos.length;
    
    const summary: Summary = {
      total_pedidos: totalPedidos,
      total_itens: items.length,
      quantidade_total: quantidadeTotal,
      faturamento_total: faturamentoTotal,
      ticket_medio: totalPedidos > 0 ? faturamentoTotal / totalPedidos : 0,
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

    // Produtos agregados por SKU (lista completa) + top 20
    const allProducts: TopProduct[] = Array.from(skuMap.entries())
      .map(([sku, data]) => ({
        produto_id: produtoMap.get(sku)?.id,
        sku,
        nome: data.nome,
        quantidade: data.quantidade,
        faturamento: data.faturamento,
        pedidos: data.pedidos.size,
        custo_embalagens: data.custo_embalagens,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const topProducts: TopProduct[] = allProducts.slice(0, 20);

    // Total de embalagens (para rodapé/total no front)
    summary.custo_embalagens_total =
      Math.round(
        ((allProducts.reduce((s, p) => s + Number(p.custo_embalagens || 0), 0)) + Number.EPSILON) * 100
      ) / 100;

    // Agrupar dados conforme groupBy
    let groupedData: unknown[] = [];
    
    if (groupBy === 'pedido') {
      // Agrupar por pedido
      const pedidoMap = new Map<string | number, SalesItem[]>();
      items.forEach(item => {
        if (!pedidoMap.has(item.pedido_id)) {
          pedidoMap.set(item.pedido_id, []);
        }
        pedidoMap.get(item.pedido_id)!.push(item);
      });
      
      groupedData = Array.from(pedidoMap.entries()).map(([pedidoId, pedidoItems]) => {
        // Dedup por SKU + valor_unitario dentro do pedido
        const merged = mergeSalesItems(pedidoItems);
        return {
          pedido_id: pedidoId,
          numero_pedido: merged[0]?.numero_pedido,
          data: merged[0]?.data,
          canal: merged[0]?.canal,
          cliente_nome: merged[0]?.cliente_nome,
          situacao: merged[0]?.situacao,
          itens: merged.length,
          quantidade_total: merged.reduce((s, i) => s + i.quantidade, 0),
          valor_total: merged.reduce((s, i) => s + i.valor_total, 0),
          items: merged,
        };
      });
    } else if (groupBy === 'canal') {
      groupedData = byChannel.map(c => ({
        ...c,
        ticket_medio: c.pedidos > 0 ? c.faturamento / c.pedidos : 0,
      }));
    } else {
      // groupBy === 'sku'
      groupedData = allProducts;
    }

    // Paginação (opcional). Quando limit=0 (ou ausente), retorna tudo em uma página.
    const totalItems = groupedData.length;
    const totalPages = noPagination ? 1 : Math.max(1, Math.ceil(totalItems / limit));
    const safePage = noPagination ? 1 : Math.min(Math.max(page, 1), totalPages);
    const paginatedData = noPagination
      ? groupedData
      : groupedData.slice((safePage - 1) * limit, safePage * limit);

    return NextResponse.json({
      success: true,
      summary,
      byChannel,
      topProducts,
      data: paginatedData,
      items: items.slice(0, 1000), // Limitar items raw para exportação
      pagination: {
        page: safePage,
        limit: noPagination ? totalItems : limit,
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
  map: Map<string, { nome: string; quantidade: number; faturamento: number; pedidos: Set<string | number>; custo_embalagens: number }>,
  sku: string,
  nome: string,
  quantidade: number,
  valor: number,
  pedidoId: string | number,
  custoEmbalagens: number
) {
  if (!map.has(sku)) {
    map.set(sku, { nome, quantidade: 0, faturamento: 0, pedidos: new Set(), custo_embalagens: 0 });
  }
  const data = map.get(sku)!;
  data.quantidade += quantidade;
  data.faturamento += valor;
  data.pedidos.add(pedidoId);
  data.custo_embalagens += custoEmbalagens;
}

// Deduplica itens de um pedido quando agrupados por pedido na resposta:
// mesma lógica do mergePedidoItens, mas preservando fields do SalesItem.
function mergeSalesItems(items: SalesItem[]): SalesItem[] {
  const map = new Map<string, SalesItem>();
  items.forEach((item, idx) => {
    const vu = Number(item.valor_unitario || 0);
    const vuRounded = Math.round((vu + Number.EPSILON) * 100) / 100;
    const key = `${item.sku || ''}||${vuRounded}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item, id: item.id ?? String(idx), valor_unitario: vuRounded });
    } else {
      existing.quantidade += item.quantidade;
      existing.valor_total += item.valor_total;
    }
  });
  return Array.from(map.values());
}

function mergePedidoItens(items: PedidoItem[]): PedidoItem[] {
  const map = new Map<string, PedidoItem>();
  items.forEach((item, idx) => {
    const vu = Number(item.valor_unitario || 0);
    const vuRounded = Math.round((vu + Number.EPSILON) * 100) / 100;
    const key = `${item.codigo_produto || ''}||${vuRounded}`;
    const existing = map.get(key);
    if (!existing) {
      // Clona para não mutar o array original
      map.set(key, { ...item, id: item.id ?? idx, valor_unitario: vuRounded });
    } else {
      existing.quantidade += item.quantidade;
      existing.valor_total += item.valor_total;
    }
  });
  return Array.from(map.values());
}
