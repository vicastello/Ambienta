import { NextRequest, NextResponse } from 'next/server';
import { listProdutosAtivosSimples } from '@/src/repositories/tinyProdutosRepository';
import { listConsumoPeriodo } from '@/src/repositories/tinyPedidoItensRepository';

type ProdutoRow = {
  id_produto_tiny: number;
  codigo: string | null;
  nome: string | null;
  gtin: string | null;
  saldo: number | null;
  reservado: number | null;
  disponivel: number | null;
  fornecedor_codigo: string | null;
  embalagem_qtd: number | null;
  tipo: string | null;
  situacao: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const periodDays = Number(searchParams.get('periodDays') || '60'); // base para consumo
    const targetMonths = Number(searchParams.get('targetMonths') || '2'); // horizonte de compra

    const startIso = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    const produtos = await listProdutosAtivosSimples();
    const consumos = await listConsumoPeriodo(startIso);

    const consumoPorProduto = new Map<number, number>();
    consumos.forEach((item) => {
      if (!item.id_produto_tiny || item.quantidade == null) return;
      const prev = consumoPorProduto.get(item.id_produto_tiny) || 0;
      consumoPorProduto.set(item.id_produto_tiny, prev + Number(item.quantidade));
    });

    const periodMonths = periodDays / 30;

    const result = (produtos as ProdutoRow[]).map((p) => {
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
  } catch (error: any) {
    console.error('[API Compras/Sugestoes] Erro:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao gerar sugestões' },
      { status: 500 }
    );
  }
}
