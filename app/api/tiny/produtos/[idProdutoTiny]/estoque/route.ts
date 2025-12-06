import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedEstoque,
  getEstoqueProdutoRealTime,
  refreshEstoqueProdutoInSupabase,
} from '@/src/services/tinyEstoqueService';

type SourceMode = 'cache' | 'live' | 'hybrid';

const STALE_MINUTES = 10;

const isStale = (updatedAt?: string | null) => {
  if (!updatedAt) return true;
  const ts = Date.parse(updatedAt);
  if (Number.isNaN(ts)) return true;
  const diffMinutes = (Date.now() - ts) / (1000 * 60);
  return diffMinutes > STALE_MINUTES;
};

export async function GET(req: NextRequest, { params }: { params: { idProdutoTiny: string } }) {
  try {
    console.log('[tiny/produtos/estoque] START', { url: req.url, params });
    // Leitura bruta do id vindo do parâmetro de rota
    const idParam = params?.idProdutoTiny;
    const idProdutoTiny = Number(idParam);
    console.log('[DEBUG ESTOQUE TINY] params.idProdutoTiny =', idParam);
    console.log('[DEBUG ESTOQUE TINY] parsed id =', idProdutoTiny);

    // Parse de query params e modo debug
    const { searchParams } = new URL(req.url);
    const debugMode = searchParams.get('debug') === '1';
    if (debugMode) {
      // Debug helper: retorna o valor bruto e o parse do id, sem tocar a API do Tiny.
      return NextResponse.json(
        {
          ok: true,
          debug: true,
          paramsRaw: idParam,
          parsedId: idProdutoTiny,
        },
        { status: 200 }
      );
    }

    // Validação do id (inteiro positivo)
    if (!Number.isFinite(idProdutoTiny) || !Number.isInteger(idProdutoTiny) || idProdutoTiny <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'INVALID_ID_PRODUTO_TINY',
            message: 'Parâmetro idProdutoTiny inválido',
          },
        },
        { status: 400 }
      );
    }

    const sourceParam = (searchParams.get('source') as SourceMode | null) ?? 'hybrid';
    const source: SourceMode = sourceParam === 'cache' || sourceParam === 'live' ? sourceParam : 'hybrid';

    // Cache only
    if (source === 'cache') {
      const cached = await getCachedEstoque(idProdutoTiny);
      if (!cached) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Produto não encontrado no cache',
            },
          },
          { status: 404 }
        );
      }
      return NextResponse.json({
        ok: true,
        source: 'cache',
        data: {
          idProdutoTiny,
          saldo: cached.saldo ?? 0,
          reservado: cached.reservado ?? 0,
          disponivel: cached.disponivel ?? 0,
          updatedAt: cached.data_atualizacao_tiny ?? null,
        },
      });
    }

    // Live only
    if (source === 'live') {
      try {
        const snapshot = await getEstoqueProdutoRealTime(idProdutoTiny);
        return NextResponse.json({ ok: true, source: 'live', data: snapshot });
      } catch (error: any) {
        console.error('[DEBUG ESTOQUE TINY] error live', error);
        const status = error?.status ?? 502;
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: 'TINY_ESTOQUE_ERROR',
              message: 'Falha ao consultar estoque no Tiny',
              details: error?.message ?? null,
            },
          },
          { status: status >= 400 && status < 600 ? status : 502 }
        );
      }
    }

    // Hybrid: tenta cache e atualiza se velho/ausente
    const cached = await getCachedEstoque(idProdutoTiny);
    const cachedSnapshot = cached
      ? {
          idProdutoTiny,
          saldo: cached.saldo ?? 0,
          reservado: cached.reservado ?? 0,
          disponivel: cached.disponivel ?? 0,
          updatedAt: cached.data_atualizacao_tiny ?? null,
        }
      : null;

    if (cachedSnapshot && !isStale(cachedSnapshot.updatedAt)) {
      console.log('[DEBUG HYBRID ESTOQUE] idProdutoTiny =', idProdutoTiny, 'mode=hybrid-cache', 'data_atualizacao_tiny=', cachedSnapshot.updatedAt);
      return NextResponse.json({ ok: true, source: 'hybrid-cache', data: cachedSnapshot });
    }

    try {
      const refreshed = await refreshEstoqueProdutoInSupabase(idProdutoTiny);
      const snapshot = refreshed
        ? {
            idProdutoTiny,
            saldo: refreshed.saldo ?? 0,
            reservado: refreshed.reservado ?? 0,
            disponivel: refreshed.disponivel ?? 0,
            updatedAt: refreshed.data_atualizacao_tiny ?? null,
          }
        : await getEstoqueProdutoRealTime(idProdutoTiny);

      console.log('[DEBUG HYBRID ESTOQUE] idProdutoTiny =', idProdutoTiny, 'mode=hybrid-live', 'data_atualizacao_tiny=', snapshot.updatedAt ?? null);
      return NextResponse.json({ ok: true, source: 'hybrid-live', data: snapshot });
    } catch (error: any) {
      console.error('[DEBUG ESTOQUE TINY] Tiny error', error);
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'TINY_ESTOQUE_ERROR',
            message: 'Falha ao atualizar estoque no Tiny',
            details: error?.message ?? null,
          },
        },
        { status: 502 }
      );
    }
  } catch (error: any) {
    console.error('[DEBUG ESTOQUE TINY] error', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Erro interno ao consultar estoque',
          details: error?.message ?? null,
        },
      },
      { status: 500 }
    );
  }
}
