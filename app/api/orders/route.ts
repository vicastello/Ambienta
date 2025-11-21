import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizarCanalTiny, descricaoSituacao } from '@/lib/tinyMapping';

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 25;
const ORDERABLE_FIELDS = new Set(['data_criacao', 'valor', 'valor_frete']);

function parseNumberList(param: string | null): number[] | null {
  if (!param) return null;
  const values = param
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  return values.length ? values : null;
}

function parseStringList(param: string | null): string[] | null {
  if (!param) return null;
  const values = param
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? values : null;
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const pageSizeRaw = Number(searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw));

    const dataInicial = searchParams.get('dataInicial');
    const dataFinal = searchParams.get('dataFinal');
    const search = searchParams.get('search')?.trim();
    const situacoes = parseNumberList(searchParams.get('situacoes'));
    const canais = parseStringList(searchParams.get('canais'));
    const sortByParam = searchParams.get('sortBy') ?? 'data_criacao';
    const sortBy = ORDERABLE_FIELDS.has(sortByParam) ? sortByParam : 'data_criacao';
    const sortDirParam = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabaseAdmin
      .from('tiny_orders')
      .select(
        'id, tiny_id, numero_pedido, situacao, data_criacao, valor, valor_frete, canal, cliente_nome, raw',
        { count: 'exact' }
      );

    if (dataInicial) {
      query = query.gte('data_criacao', dataInicial);
    }
    if (dataFinal) {
      query = query.lte('data_criacao', dataFinal);
    }
    if (situacoes) {
      query = query.in('situacao', situacoes);
    }
    if (canais) {
      query = query.in('canal', canais);
    }
    if (search) {
      const escaped = escapeLike(search);
      const numericSearch = Number(search);
      const conditions = [
        `cliente_nome.ilike.%${escaped}%`,
        `canal.ilike.%${escaped}%`,
      ];
      if (Number.isFinite(numericSearch)) {
        conditions.push(`numero_pedido.eq.${numericSearch}`);
        conditions.push(`tiny_id.eq.${numericSearch}`);
      } else {
        conditions.push(`raw->>numeroPedidoEcommerce.ilike.%${escaped}%`);
      }
      query = query.or(conditions.join(','));
    }

    const { data, error, count } = await query
      .order(sortBy, { ascending: sortDirParam === 'asc' })
      .range(from, to);

    if (error) {
      throw error;
    }

    type OrderRow = {
      id: number;
      tiny_id: number;
      numero_pedido: number | null;
      situacao: number | null;
      data_criacao: string | null;
      valor: number | null;
      valor_frete: number | null;
      canal: string | null;
      cliente_nome: string | null;
      raw: any;
    };

    const rows = (data ?? []) as OrderRow[];
    const orderIds = rows.map((order) => order.id);
    let itensPorPedido: Record<number, number> = {};

    if (orderIds.length) {
      // Leverage persisted itens instead of depending on raw payload presence
      const { data: itensData, error: itensError } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .select('id_pedido')
        .in('id_pedido', orderIds);

      if (itensError) {
        throw itensError;
      }

      itensPorPedido = (itensData ?? []).reduce<Record<number, number>>((acc, item) => {
        const idPedido = (item as { id_pedido: number | null }).id_pedido;
        if (typeof idPedido === 'number') {
          acc[idPedido] = (acc[idPedido] ?? 0) + 1;
        }
        return acc;
      }, {});
    }

    const orders = rows.map((order) => {
      const raw = (order as any).raw ?? {};
      const itens = Array.isArray(raw?.pedido?.itens)
        ? raw.pedido.itens
        : Array.isArray(raw?.itens)
          ? raw.itens
          : [];
      const firstItem = itens[0]?.produto ?? {};
      const imagem =
        firstItem?.imagemPrincipal?.url ||
        firstItem?.imagemPrincipal ||
        firstItem?.imagem ||
        firstItem?.foto ||
        null;

      const valor = Number(order.valor ?? 0);
      const valorFrete = Number(order.valor_frete ?? 0);
      const dataPrevista = raw?.dataPrevista ?? raw?.pedido?.dataPrevista ?? null;
      const notaFiscal = raw?.numeroNota ?? raw?.pedido?.numeroNota ?? null;
      const marketplaceOrder = raw?.ecommerce?.numeroPedidoEcommerce ?? raw?.numeroPedidoEcommerce ?? null;

      return {
        tinyId: order.tiny_id,
        numeroPedido: order.numero_pedido,
        dataCriacao: order.data_criacao,
        dataPrevista,
        cliente: order.cliente_nome,
        canal: normalizarCanalTiny(order.canal ?? null),
        situacao: order.situacao ?? -1,
        situacaoDescricao: descricaoSituacao(order.situacao ?? -1),
        valor,
        valorFrete,
        valorLiquido: Math.max(0, valor - valorFrete),
        // Fallback to raw itens array for legacy records without persisted itens
        itensQuantidade: itensPorPedido[order.id] ?? itens.length,
        primeiraImagem: imagem,
        notaFiscal,
        marketplaceOrder,
      };
    });

    const total = count ?? 0;
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));

    const metricsParams: Record<string, any> = {
      p_data_inicial: dataInicial ?? null,
      p_data_final: dataFinal ?? null,
      p_canais: canais ?? null,
      p_situacoes: situacoes ?? null,
      p_search: search ?? null,
    };

    const { data: metricsData, error: metricsError } = await supabaseAdmin.rpc('orders_metrics', metricsParams);
    if (metricsError) {
      throw metricsError;
    }

    const metricsRow = metricsData?.[0] ?? null;
    const statusCounts = metricsRow?.situacao_counts ?? {};

    const { data: canaisDisponiveisData } = await supabaseAdmin
      .from('tiny_orders')
      .select('canal')
      .not('canal', 'is', null)
      .order('canal', { ascending: true })
      .limit(100);

    const canaisDisponiveis = Array.from(
      new Set(
        (canaisDisponiveisData ?? [])
          .map((row) => normalizarCanalTiny(row.canal ?? null))
          .filter(Boolean)
      )
    );

    return NextResponse.json({
      orders,
      pageInfo: {
        page,
        pageSize,
        total,
        totalPages,
      },
      metrics: {
        totalPedidos: Number(metricsRow?.total_orders ?? 0),
        totalBruto: Number(metricsRow?.total_bruto ?? 0),
        totalFrete: Number(metricsRow?.total_frete ?? 0),
        totalLiquido: Number(metricsRow?.total_liquido ?? 0),
        ticketMedio:
          Number(metricsRow?.total_orders ?? 0) > 0
            ? Number(metricsRow?.total_bruto ?? 0) / Number(metricsRow?.total_orders ?? 1)
            : 0,
      },
      statusCounts,
      canaisDisponiveis,
      appliedFilters: {
        dataInicial,
        dataFinal,
        situacoes,
        canais,
        search,
        sortBy,
        sortDir: sortDirParam,
      },
    });
  } catch (error: any) {
    console.error('[API] /api/orders', error);
    return NextResponse.json(
      {
        message: 'Erro ao carregar pedidos',
        details: error?.message ?? 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
