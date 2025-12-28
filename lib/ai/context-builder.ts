/**
 * Context Builder for AI
 * Extracts and summarizes data for AI consumption
 */

export interface DashboardContext {
    faturamento?: number;
    pedidos?: number;
    ticketMedio?: number;
    frete?: number;
    cancelamentos?: string;
    canais?: Array<{ nome: string; valor: number; pedidos: number }>;
    topProdutos?: Array<{ nome: string; qtd: number; valor: number }>;
    ultimos7Dias?: Array<{ data: string; valor: number; qtd: number }>;
    comparativo?: {
        faturamento?: number | null;
        pedidos?: number | null;
        ticket?: number | null;
    };
    periodo?: { inicio: string; fim: string };
}

/**
 * Extract and summarize dashboard data for AI context
 * Keeps data small to fit token limits
 */
export function buildDashboardContext(data: unknown): DashboardContext {
    if (!data || typeof data !== 'object') return {};

    const d = data as Record<string, unknown>;
    const context: DashboardContext = {};

    // Core metrics
    if (typeof d.totalValor === 'number') context.faturamento = d.totalValor;
    if (typeof d.totalPedidos === 'number') context.pedidos = d.totalPedidos;
    if (typeof d.ticketMedio === 'number') context.ticketMedio = d.ticketMedio;
    if (typeof d.totalFreteTotal === 'number') context.frete = d.totalFreteTotal;
    if (typeof d.percentualCancelados === 'number') {
        context.cancelamentos = `${d.percentualCancelados.toFixed(1)}%`;
    }

    // Top 5 channels
    if (Array.isArray(d.canais)) {
        context.canais = (d.canais as Array<Record<string, unknown>>)
            .slice(0, 5)
            .map(c => ({
                nome: String(c.canal || 'Outros'),
                valor: Number(c.totalValor) || 0,
                pedidos: Number(c.totalPedidos) || 0,
            }));
    }

    // Top 5 products
    if (Array.isArray(d.topProdutos)) {
        context.topProdutos = (d.topProdutos as Array<Record<string, unknown>>)
            .slice(0, 5)
            .map(p => ({
                nome: String(p.descricao || '').substring(0, 50),
                qtd: Number(p.quantidade) || 0,
                valor: Number(p.totalValor || p.receita) || 0,
            }));
    }

    // Last 7 days trend
    if (Array.isArray(d.vendasPorDia)) {
        const vendas = d.vendasPorDia as Array<Record<string, unknown>>;
        context.ultimos7Dias = vendas.slice(-7).map(v => ({
            data: String(v.data),
            valor: Number(v.totalDia) || 0,
            qtd: Number(v.quantidade) || 0,
        }));
    }

    // Period info
    if (d.periodoAtual && typeof d.periodoAtual === 'object') {
        const periodo = d.periodoAtual as Record<string, unknown>;
        if (periodo.dataInicial && periodo.dataFinal) {
            context.periodo = {
                inicio: String(periodo.dataInicial),
                fim: String(periodo.dataFinal),
            };
        }
    }

    // Comparatives
    if (d.diffs && typeof d.diffs === 'object') {
        const diffs = d.diffs as Record<string, unknown>;
        context.comparativo = {
            faturamento: extractDeltaPercent(diffs.faturamento),
            pedidos: extractDeltaPercent(diffs.pedidos),
            ticket: extractDeltaPercent(diffs.ticketMedio),
        };
    }

    return context;
}

function extractDeltaPercent(diff: unknown): number | null {
    if (!diff || typeof diff !== 'object') return null;
    const d = diff as Record<string, unknown>;
    if (typeof d.deltaPercent === 'number' && Number.isFinite(d.deltaPercent)) {
        return d.deltaPercent;
    }
    return null;
}

/**
 * Estimate token count for a string (rough approximation)
 * ~4 characters per token for Portuguese
 */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Truncate context to fit within token limit
 */
export function truncateContext(context: DashboardContext, maxTokens: number = 2000): DashboardContext {
    const serialized = JSON.stringify(context);
    const currentTokens = estimateTokens(serialized);

    if (currentTokens <= maxTokens) return context;

    // Progressively reduce data
    const reduced = { ...context };

    // First, reduce ultimos7Dias to 3 days
    if (reduced.ultimos7Dias && reduced.ultimos7Dias.length > 3) {
        reduced.ultimos7Dias = reduced.ultimos7Dias.slice(-3);
    }

    // Then reduce topProdutos to 3
    if (reduced.topProdutos && reduced.topProdutos.length > 3) {
        reduced.topProdutos = reduced.topProdutos.slice(0, 3);
    }

    // Then reduce canais to 3
    if (reduced.canais && reduced.canais.length > 3) {
        reduced.canais = reduced.canais.slice(0, 3);
    }

    return reduced;
}

export default buildDashboardContext;
