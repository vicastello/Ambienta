// app/api/dashboard/financeiro/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { TODAS_SITUACOES } from '@/lib/tinyMapping';

/**
 * Endpoint para métricas financeiras estratégicas
 * 
 * Calcula rentabilidade, margem bruta/líquida e lucro
 * usando estimativas configuráveis baseadas em benchmarks de e-commerce
 */

// Configurações padrão (podem ser movidas para BD futuramente)
const DEFAULT_MARGEM_BRUTA_PERCENT = 0.37; // 37%
const DEFAULT_DESPESAS_OP_PERCENT = 0.17; // 17%

type FinanceiroResponse = {
    periodo: {
        inicio: string;
        fim: string;
    };
    receita: {
        bruta: number;
        liquida: number;
        frete: number;
    };
    rentabilidade: {
        margemBruta: number;
        margemBrutaPercent: number;
        despesasOperacionais: number;
        despesasOperacionaisPercent: number;
        lucroLiquido: number;
        margemLiquidaPercent: number;
    };
    estimado: boolean;
    nota: string;
};

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const dataInicial = searchParams.get('dataInicial');
        const dataFinal = searchParams.get('dataFinal');
        const canais = searchParams.get('canais');
        const situacoes = searchParams.get('situacoes');

        // Validação básica
        if (!dataInicial || !dataFinal) {
            return NextResponse.json(
                { error: 'dataInicial e dataFinal são obrigatórios' },
                { status: 400 }
            );
        }

        // Parse filtros
        const canaisSelecionados = canais ? canais.split(',').filter(Boolean) : null;
        const situacoesSelecionadas = situacoes
            ? situacoes.split(',').map(Number).filter(Number.isFinite)
            : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // Todas as situações

        // Buscar dados de vendas do período
        let query = supabaseAdmin
            .from('tiny_orders')
            .select('valor, valor_frete, situacao, canal, data_criacao')
            .gte('data_criacao', dataInicial)
            .lte('data_criacao', dataFinal)
            .in('situacao', situacoesSelecionadas);

        if (canaisSelecionados && canaisSelecionados.length > 0) {
            query = query.in('canal', canaisSelecionados);
        }

        const { data: pedidos, error } = await query;

        if (error) {
            console.error('[Financeiro] Erro ao buscar pedidos:', error);
            return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
        }

        // Calcular totais
        const receitaBruta = pedidos?.reduce((acc, p) => acc + (p.valor || 0), 0) || 0;
        const totalFrete = pedidos?.reduce((acc, p) => acc + (p.valor_frete || 0), 0) || 0;
        const receitaLiquida = receitaBruta - totalFrete;

        // Parâmetros customizados (ou usar defaults)
        const margemBrutaCustom = searchParams.get('margemBruta');
        const despesasOpCustom = searchParams.get('despesasOp');

        const margemBrutaPercent = margemBrutaCustom
            ? parseFloat(margemBrutaCustom)
            : DEFAULT_MARGEM_BRUTA_PERCENT * 100;

        const despesasOperacionaisPercent = despesasOpCustom
            ? parseFloat(despesasOpCustom)
            : DEFAULT_DESPESAS_OP_PERCENT * 100;

        // Cálculos de rentabilidade (usando valores configurados ou defaults)
        const margemBruta = receitaLiquida * (margemBrutaPercent / 100);
        const despesasOperacionais = receitaLiquida * (despesasOperacionaisPercent / 100);
        const lucroLiquido = margemBruta - despesasOperacionais;
        const margemLiquidaPercent = receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0;

        const response: FinanceiroResponse = {
            periodo: {
                inicio: dataInicial,
                fim: dataFinal,
            },
            receita: {
                bruta: receitaBruta,
                liquida: receitaLiquida,
                frete: totalFrete,
            },
            rentabilidade: {
                margemBruta,
                margemBrutaPercent,
                despesasOperacionais,
                despesasOperacionaisPercent,
                lucroLiquido,
                margemLiquidaPercent,
            },
            estimado: true,
            nota: "💡 Valores de margem estimados com base em benchmarks de e-commerce. Configure custos reais em Configurações para cálculos precisos.",
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('[Financeiro] Erro inesperado:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}
