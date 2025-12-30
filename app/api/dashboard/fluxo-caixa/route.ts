// app/api/dashboard/fluxo-caixa/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { jsonWithCache } from '@/src/lib/httpCache';

/**
 * Endpoint para métricas de Fluxo de Caixa
 * 
 * Calcula contas a receber, projeções e estimativas de contas a pagar
 */

const ESTIMATIVA_A_PAGAR_PERCENT = 0.20; // 20% da receita (benchmark MVP)

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const dataInicial = searchParams.get('dataInicial');
        const dataFinal = searchParams.get('dataFinal');

        // Validação básica
        if (!dataInicial || !dataFinal) {
            return NextResponse.json(
                { error: 'dataInicial e dataFinal são obrigatórios' },
                { status: 400 }
            );
        }

        // Buscar pedidos faturados (situação 1) - A RECEBER
        const { data: pedidosFaturados, error: errorFaturados } = await supabaseAdmin
            .from('tiny_orders')
            .select('id, tiny_id, valor, data_criacao, canal, cliente_nome')
            .eq('situacao', 1) // Faturado
            .gte('data_criacao', dataInicial)
            .lte('data_criacao', dataFinal)
            .order('data_criacao', { ascending: true })
            .limit(500);

        if (errorFaturados) {
            console.error('[FluxoCaixa] Erro ao buscar faturados:', errorFaturados);
            return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
        }

        const hoje = new Date();
        const em7dias = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
        const em30dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);

        // Calcular A RECEBER
        let aReceberHoje = 0;
        let aReceberProximos7dias = 0;
        let aReceberProximos30dias = 0;
        let aReceberTotal = 0;

        const pedidosDetalhados: any[] = [];

        pedidosFaturados?.forEach((pedido) => {
            const valor = pedido.valor || 0;
            aReceberTotal += valor;

            if (!pedido.data_criacao) return; // Skip se sem data

            const dataPedido = new Date(pedido.data_criacao);
            const diasAtraso = Math.floor((hoje.getTime() - dataPedido.getTime()) / (1000 * 60 * 60 * 24));

            // Vencimento estimado: 30 dias após faturamento
            const vencimento = new Date(dataPedido.getTime() + 30 * 24 * 60 * 60 * 1000);

            if (vencimento <= hoje) {
                aReceberHoje += valor;
            } else if (vencimento <= em7dias) {
                aReceberProximos7dias += valor;
            } else if (vencimento <= em30dias) {
                aReceberProximos30dias += valor;
            }

            // Cliente direto da coluna (antes: extraído do raw)
            const cliente = (pedido as any).cliente_nome || 'Cliente não identificado';

            pedidosDetalhados.push({
                id: pedido.id,
                tinyId: pedido.tiny_id,
                cliente,
                valor,
                dataFaturamento: pedido.data_criacao,
                vencimentoEstimado: vencimento.toISOString().split('T')[0],
                diasAtraso: vencimento < hoje ? Math.abs(diasAtraso) : undefined,
                canal: pedido.canal,
            });
        });

        // ESTIMATIVA A PAGAR (20% do a receber)
        const aPagarTotal = aReceberTotal * ESTIMATIVA_A_PAGAR_PERCENT;
        const aPagarHoje = aReceberHoje * ESTIMATIVA_A_PAGAR_PERCENT;
        const aPagarProximos7dias = aReceberProximos7dias * ESTIMATIVA_A_PAGAR_PERCENT;
        const aPagarProximos30dias = aReceberProximos30dias * ESTIMATIVA_A_PAGAR_PERCENT;

        // PROJEÇÕES DE SALDO
        const saldoAtual = aReceberTotal - aPagarTotal;
        const saldoEm7dias = saldoAtual + (aReceberProximos7dias - aPagarProximos7dias);
        const saldoEm30dias = saldoAtual + (aReceberProximos30dias - aPagarProximos30dias);

        // Projeções mais longas (estimativa simples)
        const saldoEm60dias = saldoEm30dias * 1.1; // 10% crescimento estimado
        const saldoEm90dias = saldoEm60dias * 1.1;

        const response = {
            periodo: {
                inicio: dataInicial,
                fim: dataFinal,
            },
            aReceber: {
                hoje: aReceberHoje,
                proximos7dias: aReceberProximos7dias,
                proximos30dias: aReceberProximos30dias,
                total: aReceberTotal,
            },
            aPagar: {
                hoje: aPagarHoje,
                proximos7dias: aPagarProximos7dias,
                proximos30dias: aPagarProximos30dias,
                total: aPagarTotal,
                estimado: true,
            },
            saldoProjetado: {
                atual: saldoAtual,
                em7dias: saldoEm7dias,
                em30dias: saldoEm30dias,
                em60dias: saldoEm60dias,
                em90dias: saldoEm90dias,
            },
            detalhamento: {
                pedidosAReceber: pedidosDetalhados.sort((a, b) => {
                    const dateA = new Date(a.vencimentoEstimado);
                    const dateB = new Date(b.vencimentoEstimado);
                    return dateA.getTime() - dateB.getTime();
                }),
                totalPedidos: pedidosDetalhados.length,
            },
            nota: "💡 Valores 'A Pagar' estimados em 20% da receita. Configure custos reais para maior precisão.",
        };

        return jsonWithCache(response, 60, 300); // Cache 60s, stale-while-revalidate 5min
    } catch (error) {
        console.error('[FluxoCaixa] Erro inesperado:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}
