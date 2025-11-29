import { NextRequest, NextResponse } from 'next/server';
import { listProdutosAtivosSimples, type ProdutoBaseRow } from '@/src/repositories/tinyProdutosRepository';
import { listConsumoPeriodo, type ConsumoRow } from '@/src/repositories/tinyPedidoItensRepository';
import { getErrorMessage } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const periodDaysParam = Number(searchParams.get('periodDays') ?? '60');
    const periodDays = Number.isFinite(periodDaysParam) && periodDaysParam > 0 ? periodDaysParam : 60;
    const targetMonthsParam = Number(searchParams.get('targetMonths') ?? '2');
    const targetMonths = Number.isFinite(targetMonthsParam) && targetMonthsParam > 0 ? targetMonthsParam : 2;

    const startIso = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    const produtos = await listProdutosAtivosSimples();
    const consumos = await listConsumoPeriodo(startIso);

    const consumoPorProduto = new Map<number, number>();
    consumos.forEach((item: ConsumoRow) => {
      if (!item.id_produto_tiny || item.quantidade == null) return;
      const prev = consumoPorProduto.get(item.id_produto_tiny) || 0;
      consumoPorProduto.set(item.id_produto_tiny, prev + Number(item.quantidade));
    });

    const periodMonths = periodDays / 30;

    const result = produtos.map((p: ProdutoBaseRow) => {
      const consumoPeriodo = consumoPorProduto.get(p.id_produto_tiny) || 0;
      const consumoMensal = consumoPeriodo / periodMonths;
      const estoqueDisponivel =
        p.disponivel ?? (p.saldo ?? 0) - (p.reservado ?? 0);
      const sugestaoBase = Math.max(targetMonths * consumoMensal - estoqueDisponivel, 0);
      const pack = Math.max(Number(p.embalagem_qtd) || 1, 1);
      const sugeridoAjustado =
        sugestaoBase > 0 ? Math.ceil(sugestaoBase / pack) * pack : 0;
      const alertaEmbalagem = sugestaoBase > 0 && sugestaoBase < pack;

      return {
        id_produto_tiny: p.id_produto_tiny,
        codigo: p.codigo,
        nome: p.nome,
        gtin: p.gtin,
        fornecedor_codigo: p.fornecedor_codigo,
        embalagem_qtd: pack,
        saldo: p.saldo ?? 0,
        reservado: p.reservado ?? 0,
        disponivel: estoqueDisponivel,
        consumo_periodo: consumoPeriodo,
        consumo_mensal: consumoMensal,
        sugestao_base: sugestaoBase,
        sugestao_ajustada: sugeridoAjustado,
        alerta_embalagem: alertaEmbalagem,
      };
    });

    return NextResponse.json({ periodDays, targetMonths, produtos: result });
  } catch (error: unknown) {
    const message = getErrorMessage(error) ?? 'Erro ao gerar sugestões';
    console.error('[API Compras/Sugestoes] Erro:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
