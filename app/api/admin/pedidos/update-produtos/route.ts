import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { obterProduto, obterEstoqueProduto, TinyApiError } from '@/lib/tinyApi';
import { upsertProduto } from '@/src/repositories/tinyProdutosRepository';
import { getErrorMessage } from '@/lib/errors';

type Body = {
  tinyIdsPedidos?: Array<number | string>;
  limitPedidos?: number;
  since?: string;
  produtoIds?: Array<number | string>;
  retries429?: number;
};

type PedidoRow = {
  id: number;
  tiny_id: number | null;
  raw: Record<string, unknown> | null;
};

type TinyPedidoRaw = {
  itens?: unknown[];
  pedido?: {
    itens?: unknown[];
    itensPedido?: unknown[];
  };
};

type TinyPedidoItemRaw = {
  produto?: TinyProdutoIdCarrier | null;
  id?: number | string | null;
  idProduto?: number | string | null;
};

type TinyProdutoIdCarrier = {
  id?: number | string | null;
  idProduto?: number | string | null;
};

type TinyProdutoAnexo = { url?: string | null };

type TinyProdutoEstoque = {
  saldo?: number | null;
  reservado?: number | null;
  disponivel?: number | null;
};

type TinyProdutoPrecos = {
  preco?: number | null;
  precoPromocional?: number | null;
};

type TinyProdutoDimensoes = {
  pesoLiquido?: number | null;
  pesoBruto?: number | null;
};

type TinyProdutoDetalhe = TinyProdutoIdCarrier & {
  codigo?: string | null;
  nome?: string | null;
  descricao?: string | null;
  unidade?: string | null;
  situacao?: string | null;
  tipo?: string | null;
  gtin?: string | null;
  anexos?: TinyProdutoAnexo[] | null;
  estoque?: TinyProdutoEstoque | null;
  precos?: TinyProdutoPrecos | null;
  dimensoes?: TinyProdutoDimensoes | null;
  dataCriacao?: string | null;
  dataAlteracao?: string | null;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const toNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const getStatusFromError = (error: unknown): number | undefined => {
  if (error instanceof TinyApiError) return error.status;
  if (typeof error === 'object' && error && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
};

async function collectPedidos(body: Body): Promise<PedidoRow[]> {
  if (Array.isArray(body.tinyIdsPedidos) && body.tinyIdsPedidos.length) {
    const ids = body.tinyIdsPedidos.map(toNumber).filter((v): v is number => v !== null);
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id,tiny_id,raw')
      .in('tiny_id', ids);
    if (error) throw error;
    return (data ?? []) as PedidoRow[];
  }

  const limit = Number.isFinite(body.limitPedidos) ? Math.max(1, Math.min(100, Number(body.limitPedidos))) : 50;
  let query = supabaseAdmin
    .from('tiny_orders')
    .select('id,tiny_id,raw')
    .order('tiny_id', { ascending: false })
    .limit(limit);

  if (typeof body.since === 'string' && body.since.trim()) {
    query = query.gte('data_criacao', body.since.trim());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PedidoRow[];
}

function extractProdutoIdsFromRaw(raw: Record<string, unknown> | null): number[] {
  const typedRaw = (raw ?? {}) as TinyPedidoRaw;
  const itensCandidate = typedRaw.itens ?? typedRaw.pedido?.itens ?? typedRaw.pedido?.itensPedido ?? [];
  const itens = Array.isArray(itensCandidate) ? itensCandidate : [];
  const ids: number[] = [];
  for (const item of itens) {
    if (!item || typeof item !== 'object') continue;
    const pedidoItem = item as TinyPedidoItemRaw;
    const prod = pedidoItem.produto ?? pedidoItem;
    const idProd = toNumber(prod?.id) ?? toNumber(prod?.idProduto) ?? toNumber(pedidoItem.id) ?? toNumber(pedidoItem.idProduto);
    if (idProd) ids.push(idProd);
  }
  return ids;
}

async function fetchProdutos(ids: number[], retries429: number) {
  let token = await getAccessTokenFromDbOrRefresh();
  const results: Array<{ id: number; ok: boolean; status?: number; error?: string; imagem?: string }> = [];

  for (const id of ids) {
    let attempts = 0;
    try {
      let detalhe: TinyProdutoDetalhe | null = null;
      let estoque: TinyProdutoEstoque | null = null;
      while (true) {
        try {
          detalhe = await obterProduto(token, id, {}) as TinyProdutoDetalhe;
          try {
            estoque = await obterEstoqueProduto(token, id, {}) as TinyProdutoEstoque;
          } catch (err) {
            console.warn('Estoque falhou para', id, err);
          }
          break;
        } catch (error: unknown) {
          const status = getStatusFromError(error);
          if (status === 401) {
            token = await getAccessTokenFromDbOrRefresh();
            continue;
          }
          if (status === 429 && attempts < retries429) {
            attempts += 1;
            const backoff = 1000 * attempts;
            console.warn(`429 no produto ${id}. Backoff ${backoff}ms (tentativa ${attempts}/${retries429})`);
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
          throw error;
        }
      }

      const detalheEstoque = detalhe?.estoque ?? null;
      const estoqueEfetivo = estoque ?? detalheEstoque ?? {};
      const detalhePrecos = detalhe?.precos ?? null;
      const dims = detalhe?.dimensoes ?? null;
      const anexos = detalhe?.anexos ?? null;
      const nomeProduto = detalhe?.nome ?? detalhe?.descricao ?? 'Produto sem nome';
      const produtoData: Parameters<typeof upsertProduto>[0] = {
        id_produto_tiny: id,
        codigo: detalhe?.codigo ?? null,
        nome: nomeProduto,
        unidade: detalhe?.unidade ?? null,
        preco: detalhePrecos?.preco ?? null,
        preco_promocional: detalhePrecos?.precoPromocional ?? null,
        situacao: detalhe?.situacao ?? null,
        tipo: detalhe?.tipo ?? null,
        gtin: detalhe?.gtin ?? null,
        imagem_url: anexos?.find?.((anexo) => anexo?.url)?.url ?? null,
        saldo: estoqueEfetivo.saldo ?? null,
        reservado: estoqueEfetivo.reservado ?? null,
        disponivel: estoqueEfetivo.disponivel ?? null,
        descricao: detalhe?.descricao ?? null,
        ncm: detalhe?.ncm ?? null,
        origem: detalhe?.origem ?? null,
        peso_liquido: dims?.pesoLiquido ?? null,
        peso_bruto: dims?.pesoBruto ?? null,
        data_criacao_tiny: detalhe?.dataCriacao ?? null,
        data_atualizacao_tiny: detalhe?.dataAlteracao ?? null,
      };
      await upsertProduto(produtoData);
      results.push({ id, ok: true, imagem: produtoData.imagem_url });
    } catch (error: unknown) {
      const status = getStatusFromError(error);
      results.push({ id, ok: false, status, error: getErrorMessage(error) ?? String(error) });
    }
  }

  return results;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    const body: Body = isRecord(rawBody) ? (rawBody as Body) : {};
    const retries429 = Number.isFinite(body.retries429) ? Math.max(0, Number(body.retries429)) : 5;

    let produtoIds: number[] = [];
    if (Array.isArray(body.produtoIds) && body.produtoIds.length) {
      produtoIds = body.produtoIds.map(toNumber).filter((v): v is number => v !== null);
    } else {
      const pedidos = await collectPedidos(body);
      const pedidoIds = pedidos.map((p) => p.id);

      // IDs vindos de itens já gravados
      const { data: itensData } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .select('id_produto_tiny')
        .in('id_pedido', pedidoIds);
      const idsItens = (itensData ?? [])
        .map(({ id_produto_tiny }) => (typeof id_produto_tiny === 'number' ? id_produto_tiny : null))
        .filter((v): v is number => v !== null);

      // IDs vindos do raw
      const idsRaw = pedidos.flatMap((p) => extractProdutoIdsFromRaw(p.raw ?? null));

      const setIds = new Set<number>([...idsItens, ...idsRaw]);
      produtoIds = Array.from(setIds);
    }

    // Limitar para não estourar timebox
    produtoIds = produtoIds.slice(0, 80);

    if (!produtoIds.length) {
      return NextResponse.json({ ok: true, message: 'Nenhum produto para atualizar' });
    }

    const results = await fetchProdutos(produtoIds, retries429);
    return NextResponse.json({ ok: true, count: results.length, results });
  } catch (err: unknown) {
    const msg = getErrorMessage(err) ?? 'Erro inesperado';
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
