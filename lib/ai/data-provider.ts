/**
 * AI Data Provider - Deep Supabase Integration
 * Provides comprehensive data access for AI analysis
 */

import { createClient } from '@supabase/supabase-js';
import { REVENUE_EXCLUDED_STATUSES } from '@/lib/ai/db-insight-index';

// Create untyped client for flexibility with various table schemas
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient<any>(supabaseUrl, supabaseKey);

// ============================================================================
// TYPES
// ============================================================================

export interface SalesAnalysis {
    period: { start: string; end: string };
    summary: {
        totalRevenue: number;
        netRevenue: number;
        orderCount: number;
        averageOrderValue: number;
    };
    byChannel: Array<{
        channel: string;
        revenue: number;
        orders: number;
        percentage: number;
    }>;
    byDay: Array<{
        date: string;
        revenue: number;
        orders: number;
    }>;
    topProducts: Array<{
        name: string;
        sku: string;
        quantity: number;
        revenue: number;
    }>;
    comparison?: {
        previousRevenue: number;
        revenueChange: number;
        previousOrders: number;
        ordersChange: number;
    };
}

export interface InventoryAnalysis {
    summary: {
        totalProducts: number;
        lowStockCount: number;
        outOfStockCount: number;
        totalInventoryValue: number;
    };
    lowStockAlerts: Array<{
        name: string;
        sku: string;
        currentStock: number;
        minStock: number;
    }>;
    topMovingProducts: Array<{
        name: string;
        soldLast30Days: number;
        currentStock: number;
    }>;
}

export interface FinancialAnalysis {
    period: { start: string; end: string };
    cashFlow: {
        totalIncome: number;
        totalExpenses: number;
        netCashFlow: number;
        pendingReceivables: number;
        pendingPayables: number;
    };
    byCategory: Array<{
        category: string;
        type: 'income' | 'expense';
        amount: number;
    }>;
    monthlyTrend: Array<{
        month: string;
        income: number;
        expenses: number;
        net: number;
    }>;
}

export interface ComprehensiveBusinessData {
    generatedAt: string;
    periodDays: number;
    sales: SalesAnalysis;
    inventory: InventoryAnalysis;
    financial: FinancialAnalysis;
    insights: {
        strengths: string[];
        weaknesses: string[];
        opportunities: string[];
        risks: string[];
    };
}

// ============================================================================
// AI DATA PROVIDER
// ============================================================================

export class AIDataProvider {
    /**
     * Get comprehensive sales analysis for a period
     */
    async getSalesAnalysis(startDate: string, endDate: string): Promise<SalesAnalysis> {
        // Get orders from tiny_orders
        const { data: orders, error: ordersError } = await supabase
            .from('tiny_orders')
            .select('id, tiny_id, valor, valor_esperado_liquido, canal, data_criacao, situacao')
            .gte('data_criacao', startDate)
            .lte('data_criacao', endDate)
            .order('data_criacao', { ascending: true })
            .limit(1000);

        if (ordersError) {
            console.error('[AIDataProvider] Orders query error:', ordersError);
            throw ordersError;
        }

        const orderList = (orders || []) as Array<{ situacao?: number | null } & typeof orders[number]>;
        const revenueOrders = orderList.filter((o) => !REVENUE_EXCLUDED_STATUSES.has((o as any)?.situacao ?? -1));

        // Calculate summary
        // Note: Results capped at 1000 to limit egress
        const totalRevenue = revenueOrders.reduce((sum: number, o: { valor: number | null }) => sum + (o.valor || 0), 0);
        const netRevenue = revenueOrders.reduce((sum: number, o: { valor_esperado_liquido: number | null }) =>
            sum + (o.valor_esperado_liquido || 0), 0);
        const orderCount = revenueOrders.length;
        const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

        // Group by channel
        const channelMap = new Map<string, { revenue: number; orders: number }>();
        revenueOrders.forEach((o: { canal: string | null; valor: number | null }) => {
            const channel = o.canal || 'Outros';
            const existing = channelMap.get(channel) || { revenue: 0, orders: 0 };
            channelMap.set(channel, {
                revenue: existing.revenue + (o.valor || 0),
                orders: existing.orders + 1,
            });
        });

        const byChannel = Array.from(channelMap.entries())
            .map(([channel, data]) => ({
                channel,
                revenue: data.revenue,
                orders: data.orders,
                percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
            }))
            .sort((a, b) => b.revenue - a.revenue);

        // Group by day
        const dayMap = new Map<string, { revenue: number; orders: number }>();
        revenueOrders.forEach((o: { data_criacao: string | null; valor: number | null }) => {
            const day = o.data_criacao?.split('T')[0] || o.data_criacao?.split(' ')[0] || '';
            if (!day) return;
            const existing = dayMap.get(day) || { revenue: 0, orders: 0 };
            dayMap.set(day, {
                revenue: existing.revenue + (o.valor || 0),
                orders: existing.orders + 1,
            });
        });

        const byDay = Array.from(dayMap.entries())
            .map(([date, data]) => ({
                date,
                revenue: data.revenue,
                orders: data.orders,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Get top products from tiny_pedido_itens
        const orderIds = revenueOrders.map((o: { id: number }) => o.id);
        let topProducts: SalesAnalysis['topProducts'] = [];

        if (orderIds.length > 0) {
            const { data: items } = await supabase
                .from('tiny_pedido_itens')
                .select('descricao, codigo, quantidade, valor_total')
                .in('id_pedido', orderIds.slice(0, 500));

            if (items) {
                const productMap = new Map<string, { name: string; sku: string; quantity: number; revenue: number }>();
                items.forEach((item: { descricao: string; codigo: string; quantidade: number; valor_total: number }) => {
                    const key = item.codigo || item.descricao;
                    const existing = productMap.get(key) || {
                        name: item.descricao || 'Desconhecido',
                        sku: item.codigo || '',
                        quantity: 0,
                        revenue: 0,
                    };
                    productMap.set(key, {
                        ...existing,
                        quantity: existing.quantity + (item.quantidade || 0),
                        revenue: existing.revenue + (item.valor_total || 0),
                    });
                });

                topProducts = Array.from(productMap.values())
                    .sort((a, b) => b.revenue - a.revenue)
                    .slice(0, 10);
            }
        }

        // Get previous period for comparison
        const periodDays = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
        const prevEndDate = new Date(startDate);
        prevEndDate.setDate(prevEndDate.getDate() - 1);
        const prevStartDate = new Date(prevEndDate);
        prevStartDate.setDate(prevStartDate.getDate() - periodDays);

        const { data: prevOrders } = await supabase
            .from('tiny_orders')
            .select('valor, situacao')
            .gte('data_criacao', prevStartDate.toISOString().split('T')[0])
            .lte('data_criacao', prevEndDate.toISOString().split('T')[0]);

        const prevFiltered = (prevOrders || []).filter((o: { situacao?: number | null }) => !REVENUE_EXCLUDED_STATUSES.has(o.situacao ?? -1));
        const prevRevenue = prevFiltered.reduce((sum: number, o: { valor: number | null }) => sum + (o.valor || 0), 0);
        const prevOrderCount = prevFiltered.length;

        const comparison = prevOrderCount > 0 ? {
            previousRevenue: prevRevenue,
            revenueChange: ((totalRevenue - prevRevenue) / prevRevenue) * 100,
            previousOrders: prevOrderCount,
            ordersChange: ((orderCount - prevOrderCount) / prevOrderCount) * 100,
        } : undefined;

        return {
            period: { start: startDate, end: endDate },
            summary: { totalRevenue, netRevenue, orderCount, averageOrderValue },
            byChannel,
            byDay,
            topProducts,
            comparison,
        };
    }

    /**
     * Get inventory analysis with alerts
     */
    async getInventoryAnalysis(): Promise<InventoryAnalysis> {
        // Get products from tiny_produtos
        const { data: products, error } = await supabase
            .from('tiny_produtos')
            .select('id, nome, codigo, saldo, preco')
            .eq('situacao', 'A')
            .order('saldo', { ascending: true })
            .limit(500);

        if (error) {
            console.error('[AIDataProvider] Products query error:', error);
            throw error;
        }

        const productList = products || [];
        const totalProducts = productList.length;

        // Use static threshold for low stock since we don't have min_stock yet
        const LOW_STOCK_THRESHOLD = 5;

        const lowStockProducts = productList.filter((p: { saldo: number | null }) =>
            (p.saldo || 0) <= LOW_STOCK_THRESHOLD && (p.saldo || 0) > 0
        );

        const outOfStockProducts = productList.filter((p: { saldo: number | null }) =>
            (p.saldo || 0) <= 0
        );

        // Calculate inventory value using sales price (proxy for value)
        const totalInventoryValue = productList.reduce((sum: number, p: { saldo: number | null; preco: number | null }) =>
            sum + ((p.saldo || 0) * (p.preco || 0)), 0
        );

        const lowStockAlerts = lowStockProducts.slice(0, 10).map((p: { nome: string; codigo: string; saldo: number | null }) => ({
            name: p.nome,
            sku: p.codigo || '',
            currentStock: p.saldo || 0,
            minStock: LOW_STOCK_THRESHOLD,
        }));

        // Get sales velocity from last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: recentItems } = await supabase
            .from('tiny_pedido_itens')
            .select('codigo, quantidade')
            .gte('created_at', thirtyDaysAgo.toISOString());

        const salesByProduct = new Map<string, number>();
        (recentItems || []).forEach((item: { codigo: string; quantidade: number }) => {
            if (item.codigo) {
                salesByProduct.set(item.codigo, (salesByProduct.get(item.codigo) || 0) + (item.quantidade || 0));
            }
        });

        const topMovingProducts = Array.from(salesByProduct.entries())
            .map(([sku, soldQty]) => {
                const product = productList.find((p: { codigo: string }) => p.codigo === sku);
                return {
                    name: product?.nome || sku,
                    soldLast30Days: soldQty,
                    currentStock: product?.saldo || 0,
                };
            })
            .sort((a, b) => b.soldLast30Days - a.soldLast30Days)
            .slice(0, 10);

        return {
            summary: {
                totalProducts,
                lowStockCount: lowStockProducts.length,
                outOfStockCount: outOfStockProducts.length,
                totalInventoryValue,
            },
            lowStockAlerts,
            topMovingProducts,
        };
    }

    /**
     * Get financial analysis from cash flow entries
     */
    async getFinancialAnalysis(startDate: string, endDate: string): Promise<FinancialAnalysis> {
        const { data: entries, error } = await supabase
            .from('cash_flow_entries')
            .select('id, type, amount, status, category, due_date')
            .gte('due_date', startDate)
            .lte('due_date', endDate)
            .order('due_date', { ascending: true });

        if (error) {
            console.error('[AIDataProvider] Cash flow query error:', error);
            throw error;
        }

        const entryList = entries || [];

        const paidEntries = entryList.filter((e: { status: string }) => e.status === 'paid');
        const pendingEntries = entryList.filter((e: { status: string }) => e.status === 'pending');

        const totalIncome = paidEntries
            .filter((e: { type: string }) => e.type === 'income')
            .reduce((sum: number, e: { amount: number }) => sum + (e.amount || 0), 0);

        const totalExpenses = paidEntries
            .filter((e: { type: string }) => e.type === 'expense')
            .reduce((sum: number, e: { amount: number }) => sum + (e.amount || 0), 0);

        const pendingReceivables = pendingEntries
            .filter((e: { type: string }) => e.type === 'income')
            .reduce((sum: number, e: { amount: number }) => sum + (e.amount || 0), 0);

        const pendingPayables = pendingEntries
            .filter((e: { type: string }) => e.type === 'expense')
            .reduce((sum: number, e: { amount: number }) => sum + (e.amount || 0), 0);

        // Group by category
        const categoryMap = new Map<string, { type: 'income' | 'expense'; amount: number }>();
        paidEntries.forEach((e: { category: string; type: string; amount: number }) => {
            const key = e.category || 'Outros';
            const existing = categoryMap.get(key);
            if (existing) {
                existing.amount += e.amount || 0;
            } else {
                categoryMap.set(key, { type: e.type as 'income' | 'expense', amount: e.amount || 0 });
            }
        });

        const byCategory = Array.from(categoryMap.entries())
            .map(([category, data]) => ({ category, ...data }))
            .sort((a, b) => b.amount - a.amount);

        // Monthly trend (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const { data: historicalEntries } = await supabase
            .from('cash_flow_entries')
            .select('type, amount, due_date, status')
            .gte('due_date', sixMonthsAgo.toISOString().split('T')[0])
            .eq('status', 'paid');

        const monthlyMap = new Map<string, { income: number; expenses: number }>();
        (historicalEntries || []).forEach((e: { type: string; amount: number; due_date: string }) => {
            const month = e.due_date.substring(0, 7);
            const existing = monthlyMap.get(month) || { income: 0, expenses: 0 };
            if (e.type === 'income') {
                existing.income += e.amount || 0;
            } else {
                existing.expenses += e.amount || 0;
            }
            monthlyMap.set(month, existing);
        });

        const monthlyTrend = Array.from(monthlyMap.entries())
            .map(([month, data]) => ({
                month,
                income: data.income,
                expenses: data.expenses,
                net: data.income - data.expenses,
            }))
            .sort((a, b) => a.month.localeCompare(b.month));

        return {
            period: { start: startDate, end: endDate },
            cashFlow: {
                totalIncome,
                totalExpenses,
                netCashFlow: totalIncome - totalExpenses,
                pendingReceivables,
                pendingPayables,
            },
            byCategory,
            monthlyTrend,
        };
    }

    /**
     * Get comprehensive business data for AI analysis
     */
    async getComprehensiveData(periodDays = 30): Promise<ComprehensiveBusinessData> {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);
        const startDateStr = startDate.toISOString().split('T')[0];

        const [sales, inventory, financial] = await Promise.all([
            this.getSalesAnalysis(startDateStr, endDate),
            this.getInventoryAnalysis(),
            this.getFinancialAnalysis(startDateStr, endDate),
        ]);

        const insights = this.generateInsights(sales, inventory, financial);

        return {
            generatedAt: new Date().toISOString(),
            periodDays,
            sales,
            inventory,
            financial,
            insights,
        };
    }

    /**
     * Get comprehensive business data for a specific period
     */
    async getComprehensiveDataForPeriod(startDate: string, endDate: string): Promise<ComprehensiveBusinessData> {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffMs = end.getTime() - start.getTime();
        const periodDays = Number.isFinite(diffMs) ? Math.max(1, Math.round(diffMs / 86_400_000) + 1) : 30;

        const [sales, inventory, financial] = await Promise.all([
            this.getSalesAnalysis(startDate, endDate),
            this.getInventoryAnalysis(),
            this.getFinancialAnalysis(startDate, endDate),
        ]);

        const insights = this.generateInsights(sales, inventory, financial);

        return {
            generatedAt: new Date().toISOString(),
            periodDays,
            sales,
            inventory,
            financial,
            insights,
        };
    }

    /**
     * Generate business insights from data
     */
    private generateInsights(
        sales: SalesAnalysis,
        inventory: InventoryAnalysis,
        financial: FinancialAnalysis
    ): ComprehensiveBusinessData['insights'] {
        const strengths: string[] = [];
        const weaknesses: string[] = [];
        const opportunities: string[] = [];
        const risks: string[] = [];

        // Revenue analysis
        if (sales.comparison && sales.comparison.revenueChange > 10) {
            strengths.push(`Crescimento de ${sales.comparison.revenueChange.toFixed(1)}% no faturamento`);
        }
        if (sales.comparison && sales.comparison.revenueChange < -10) {
            weaknesses.push(`Queda de ${Math.abs(sales.comparison.revenueChange).toFixed(1)}% no faturamento`);
        }

        // Channel concentration
        if (sales.byChannel.length > 0 && sales.byChannel[0].percentage > 80) {
            risks.push(`${sales.byChannel[0].percentage.toFixed(0)}% dependência do canal ${sales.byChannel[0].channel}`);
            opportunities.push('Diversificar canais de venda');
        }

        // Inventory health
        if (inventory.summary.lowStockCount > 5) {
            risks.push(`${inventory.summary.lowStockCount} produtos com estoque baixo`);
        }
        if (inventory.summary.outOfStockCount > 0) {
            weaknesses.push(`${inventory.summary.outOfStockCount} produtos sem estoque`);
        }

        // Financial health
        if (financial.cashFlow.netCashFlow > 0) {
            strengths.push(`Fluxo de caixa positivo: R$ ${financial.cashFlow.netCashFlow.toLocaleString('pt-BR')}`);
        } else if (financial.cashFlow.netCashFlow < 0) {
            weaknesses.push(`Fluxo de caixa negativo: R$ ${Math.abs(financial.cashFlow.netCashFlow).toLocaleString('pt-BR')}`);
        }

        if (financial.cashFlow.pendingPayables > financial.cashFlow.pendingReceivables * 1.5) {
            risks.push('Contas a pagar excedem significativamente contas a receber');
        }

        return { strengths, weaknesses, opportunities, risks };
    }

    /**
     * Format data for AI consumption (smaller payload for prompts)
     */
    formatForAI(data: ComprehensiveBusinessData): string {
        const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

        return `
# Dados do Negócio - Últimos ${data.periodDays} dias

## Vendas
- Faturamento: R$ ${fmt(data.sales.summary.totalRevenue)}
- Faturamento Líquido: R$ ${fmt(data.sales.summary.netRevenue)}
- Pedidos: ${data.sales.summary.orderCount}
- Ticket Médio: R$ ${fmt(data.sales.summary.averageOrderValue)}
${data.sales.comparison ? `- Variação vs período anterior: ${data.sales.comparison.revenueChange >= 0 ? '+' : ''}${data.sales.comparison.revenueChange.toFixed(1)}%` : ''}

### Por Canal
${data.sales.byChannel.slice(0, 5).map(c => `- ${c.channel}: R$ ${fmt(c.revenue)} (${c.percentage.toFixed(1)}%) - ${c.orders} pedidos`).join('\n')}

### Top 5 Produtos
${data.sales.topProducts.slice(0, 5).map((p, i) => `${i + 1}. ${p.name}: ${p.quantity}un - R$ ${fmt(p.revenue)}`).join('\n')}

## Estoque
- Total de Produtos Ativos: ${data.inventory.summary.totalProducts}
- Estoque Baixo: ${data.inventory.summary.lowStockCount} produtos
- Sem Estoque: ${data.inventory.summary.outOfStockCount} produtos
- Valor em Estoque: R$ ${fmt(data.inventory.summary.totalInventoryValue)}

${data.inventory.lowStockAlerts.length > 0 ? `### Alertas de Estoque Baixo
${data.inventory.lowStockAlerts.slice(0, 5).map(p => `- ${p.name}: ${p.currentStock}un (mín: ${p.minStock})`).join('\n')}` : ''}

## Financeiro
- Receitas: R$ ${fmt(data.financial.cashFlow.totalIncome)}
- Despesas: R$ ${fmt(data.financial.cashFlow.totalExpenses)}
- Saldo: R$ ${fmt(data.financial.cashFlow.netCashFlow)}
- A Receber: R$ ${fmt(data.financial.cashFlow.pendingReceivables)}
- A Pagar: R$ ${fmt(data.financial.cashFlow.pendingPayables)}

## Diagnóstico
### Pontos Fortes
${data.insights.strengths.map(s => `✅ ${s}`).join('\n') || '(nenhum identificado)'}

### Pontos de Atenção
${data.insights.weaknesses.map(w => `⚠️ ${w}`).join('\n') || '(nenhum identificado)'}

### Oportunidades
${data.insights.opportunities.map(o => `💡 ${o}`).join('\n') || '(nenhuma identificada)'}

### Riscos
${data.insights.risks.map(r => `🚨 ${r}`).join('\n') || '(nenhum identificado)'}
`.trim();
    }
}

// Singleton instance
let dataProviderInstance: AIDataProvider | null = null;

export function getAIDataProvider(): AIDataProvider {
    if (!dataProviderInstance) {
        dataProviderInstance = new AIDataProvider();
    }
    return dataProviderInstance;
}

export default getAIDataProvider;
