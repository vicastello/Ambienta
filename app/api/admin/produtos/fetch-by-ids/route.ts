import { NextRequest, NextResponse } from 'next/server';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { obterProduto, obterEstoqueProduto, TinyApiError } from '@/lib/tinyApi';
import { upsertProduto } from '@/src/repositories/tinyProdutosRepository';
import { getErrorMessage } from '@/lib/errors';

type Body = {
  tinyIds?: Array<number | string>;
  retries429?: number;
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
  ncm?: string | null;
  origem?: string | null;
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

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    const body: Body = isRecord(rawBody) ? (rawBody as Body) : {};
    const retries429 = Number.isFinite(body.retries429) ? Math.max(0, Number(body.retries429)) : 5;

    const ids = (Array.isArray(body.tinyIds) ? body.tinyIds : [])
      .map(toNumber)
      .filter((v): v is number => v !== null);

    if (!ids.length) {
      return NextResponse.json({ ok: false, message: 'Envie tinyIds' }, { status: 400 });
    }

    let token = await getAccessTokenFromDbOrRefresh();
    const results: Array<{ id: number; ok: boolean; status?: number; imagem?: string; error?: string }> = [];

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

        const estoqueFinal = estoque ?? detalhe?.estoque ?? {};
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
          saldo: estoqueFinal.saldo ?? null,
          reservado: estoqueFinal.reservado ?? null,
          disponivel: estoqueFinal.disponivel ?? null,
          descricao: detalhe?.descricao ?? null,
          ncm: detalhe?.ncm ?? null,
          origem: detalhe?.origem ?? null,
          peso_liquido: dims?.pesoLiquido ?? null,
          peso_bruto: dims?.pesoBruto ?? null,
          data_criacao_tiny: detalhe?.dataCriacao ?? null,
          data_atualizacao_tiny: detalhe?.dataAlteracao ?? null,
        };
        await upsertProduto(produtoData);
        results.push({ id, ok: true, imagem: produtoData.imagem_url ?? undefined });
      } catch (error: unknown) {
        const status = getStatusFromError(error);
        results.push({
          id,
          ok: false,
          status,
          error: getErrorMessage(error) ?? String(error),
        });
      }
    }

    return NextResponse.json({ ok: true, count: results.length, results });
  } catch (err: unknown) {
    const msg = getErrorMessage(err) ?? 'Erro inesperado';
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
