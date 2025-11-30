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

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const toNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

async function collectPedidos(body: Body) {
  if (Array.isArray(body.tinyIdsPedidos) && body.tinyIdsPedidos.length) {
    const ids = body.tinyIdsPedidos.map(toNumber).filter((v): v is number => v !== null);
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id,tiny_id,raw')
      .in('tiny_id', ids);
    if (error) throw error;
    return data ?? [];
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
  return data ?? [];
}

function extractProdutoIdsFromRaw(raw: any): number[] {
  const itens =
    Array.isArray(raw?.itens)
      ? raw.itens
      : Array.isArray(raw?.pedido?.itens)
        ? raw.pedido.itens
        : Array.isArray(raw?.pedido?.itensPedido)
          ? raw.pedido.itensPedido
          : [];
  const ids: number[] = [];
  for (const item of itens) {
    const prod = item?.produto ?? item ?? {};
    const idProd = toNumber(prod.id) ?? toNumber(prod.idProduto);
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
      let detalhe: any = null;
      let estoque: any = null;
      while (true) {
        try {
          detalhe = await obterProduto(token, id, {});
          try {
            estoque = await obterEstoqueProduto(token, id, {});
          } catch (err) {
            console.warn('Estoque falhou para', id, err);
          }
          break;
        } catch (err: any) {
          if (err instanceof TinyApiError && err.status === 401) {
            token = await getAccessTokenFromDbOrRefresh();
            continue;
          }
          if (err instanceof TinyApiError && err.status === 429 && attempts < retries429) {
            attempts += 1;
            const backoff = 1000 * attempts;
            console.warn(`429 no produto ${id}. Backoff ${backoff}ms (tentativa ${attempts}/${retries429})`);
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
          throw err;
        }
      }

      const detalheEstoque = detalhe?.estoque || {};
      const estOk = estoque || {};
      const detalhePrecos = detalhe?.precos || {};
      const dims = detalhe?.dimensoes || {};
      const produtoData: any = {
        id_produto_tiny: id,
        codigo: detalhe?.codigo ?? null,
        nome: detalhe?.nome ?? detalhe?.descricao ?? null,
        unidade: detalhe?.unidade ?? null,
        preco: detalhePrecos?.preco ?? null,
        preco_promocional: detalhePrecos?.precoPromocional ?? null,
        situacao: detalhe?.situacao ?? null,
        tipo: detalhe?.tipo ?? null,
        gtin: detalhe?.gtin ?? null,
        imagem_url: detalhe?.anexos?.find?.((a: any) => a.url)?.url ?? null,
        saldo: detalheEstoque?.saldo ?? estOk?.saldo ?? null,
        reservado: detalheEstoque?.reservado ?? estOk?.reservado ?? null,
        disponivel: detalheEstoque?.disponivel ?? estOk?.disponivel ?? null,
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
    } catch (err: any) {
      results.push({ id, ok: false, status: err?.status ?? undefined, error: getErrorMessage(err) ?? String(err) });
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
      const pedidoIds = pedidos.map((p: any) => p.id);

      // IDs vindos de itens já gravados
      const { data: itensData } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .select('id_produto_tiny')
        .in('id_pedido', pedidoIds);
      const idsItens = (itensData ?? [])
        .map((r: any) => (typeof r.id_produto_tiny === 'number' ? r.id_produto_tiny : null))
        .filter((v): v is number => v !== null);

      // IDs vindos do raw
      const idsRaw = pedidos.flatMap((p: any) => extractProdutoIdsFromRaw(p.raw || {}));

      const setIds = new Set<number>([...idsItens, ...idsRaw].filter((v) => Number.isFinite(v)));
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
