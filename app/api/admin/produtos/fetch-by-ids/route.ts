import { NextRequest, NextResponse } from 'next/server';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { obterProduto, obterEstoqueProduto } from '@/lib/tinyApi';
import { upsertProduto } from '@/src/repositories/tinyProdutosRepository';
import { getErrorMessage } from '@/lib/errors';

type Body = {
  tinyIds?: Array<number | string>;
  retries429?: number;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    const body: Body = isRecord(rawBody) ? (rawBody as Body) : {};
    const retries429 = Number.isFinite(body.retries429) ? Math.max(0, Number(body.retries429)) : 5;

    const ids = (Array.isArray(body.tinyIds) ? body.tinyIds : [])
      .map((v) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : null))
      .filter((v): v is number => Number.isFinite(v));

    if (!ids.length) {
      return NextResponse.json({ ok: false, message: 'Envie tinyIds' }, { status: 400 });
    }

    let token = await getAccessTokenFromDbOrRefresh();
    const results: Array<{ id: number; ok: boolean; status?: number; imagem?: string; error?: string }> = [];

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
            if (err?.status === 401) {
              token = await getAccessTokenFromDbOrRefresh();
              continue;
            }
            if (err?.status === 429 && attempts < retries429) {
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
        results.push({
          id,
          ok: false,
          status: err?.status ?? undefined,
          error: getErrorMessage(err) ?? String(err),
        });
      }
    }

    return NextResponse.json({ ok: true, count: results.length, results });
  } catch (err: unknown) {
    const msg = getErrorMessage(err) ?? 'Erro inesperado';
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
