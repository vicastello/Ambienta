/**
 * Proactive Insights Generator
 * Analyzes dashboard data and generates alerts/opportunities automatically
 */

import { createOpenAICompatibleClient, resolveAiRuntimeConfig } from './ai-runtime';
import { buildDashboardContext, type DashboardContext } from './context-builder';

export type InsightType =
    | 'stock_alert'      // Estoque baixo
    | 'sales_drop'       // Queda de vendas
    | 'sales_spike'      // Pico de vendas
    | 'channel_growth'   // Crescimento de canal
    | 'opportunity'      // Oportunidade detectada
    | 'trend'            // Tendência identificada
    | 'risk';            // Risco detectado

export type InsightPriority = 'low' | 'medium' | 'high' | 'critical';

export interface ProactiveInsight {
    id: string;
    type: InsightType;
    priority: InsightPriority;
    title: string;
    body: string;
    metric?: {
        value: number;
        change?: number;
        label: string;
    };
    action?: {
        label: string;
        href?: string;
    };
    createdAt: string;
}

/**
 * Detect insights from dashboard metrics
 */
export function detectMetricInsights(context: DashboardContext): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    const now = new Date().toISOString();

    // Check comparativo for significant changes
    if (context.comparativo) {
        const { faturamento, pedidos, ticket } = context.comparativo;

        // Sales drop alert (>15% drop)
        if (faturamento != null && faturamento < -15) {
            insights.push({
                id: `sales-drop-${Date.now()}`,
                type: 'sales_drop',
                priority: faturamento < -30 ? 'critical' : 'high',
                title: 'Queda nas vendas',
                body: `Faturamento caiu ${Math.abs(faturamento).toFixed(1)}% em relação ao período anterior. Verifique possíveis causas.`,
                metric: {
                    value: context.faturamento || 0,
                    change: faturamento,
                    label: 'Faturamento',
                },
                createdAt: now,
            });
        }

        // Sales spike (>30% increase)
        if (faturamento != null && faturamento > 30) {
            insights.push({
                id: `sales-spike-${Date.now()}`,
                type: 'sales_spike',
                priority: 'medium',
                title: 'Pico de vendas!',
                body: `Faturamento subiu ${faturamento.toFixed(1)}%. Ótimo momento para revisar estoque.`,
                metric: {
                    value: context.faturamento || 0,
                    change: faturamento,
                    label: 'Faturamento',
                },
                action: {
                    label: 'Ver Estoque',
                    href: '/produtos',
                },
                createdAt: now,
            });
        }

        // Ticket médio drop (>10%)
        if (ticket != null && ticket < -10) {
            insights.push({
                id: `ticket-drop-${Date.now()}`,
                type: 'risk',
                priority: 'medium',
                title: 'Ticket médio em queda',
                body: `Ticket médio caiu ${Math.abs(ticket).toFixed(1)}%. Considere estratégias de upsell.`,
                metric: {
                    value: context.ticketMedio || 0,
                    change: ticket,
                    label: 'Ticket Médio',
                },
                createdAt: now,
            });
        }
    }

    // Check channel concentration
    if (context.canais && context.canais.length > 0 && context.faturamento) {
        const topChannel = context.canais[0];
        const topChannelShare = (topChannel.valor / context.faturamento) * 100;

        if (topChannelShare > 80) {
            insights.push({
                id: `channel-concentration-${Date.now()}`,
                type: 'risk',
                priority: 'medium',
                title: 'Alta concentração em um canal',
                body: `${topChannel.nome} representa ${topChannelShare.toFixed(0)}% das vendas. Considere diversificar.`,
                metric: {
                    value: topChannelShare,
                    label: `% em ${topChannel.nome}`,
                },
                createdAt: now,
            });
        }
    }

    // Check daily trend (last 7 days)
    if (context.ultimos7Dias && context.ultimos7Dias.length >= 5) {
        const days = context.ultimos7Dias;
        const lastDay = days[days.length - 1];
        const previousDays = days.slice(0, -1);
        const avgPrevious = previousDays.reduce((sum, d) => sum + d.valor, 0) / previousDays.length;

        // Yesterday significantly above average
        if (lastDay.valor > avgPrevious * 1.5) {
            insights.push({
                id: `good-day-${Date.now()}`,
                type: 'opportunity',
                priority: 'low',
                title: 'Dia acima da média!',
                body: `O dia ${lastDay.data} teve R$ ${lastDay.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, ${((lastDay.valor / avgPrevious - 1) * 100).toFixed(0)}% acima da média.`,
                metric: {
                    value: lastDay.valor,
                    label: 'Vendas do dia',
                },
                createdAt: now,
            });
        }

        // Check for declining trend (3+ consecutive drops)
        let consecutiveDrops = 0;
        for (let i = 1; i < days.length; i++) {
            if (days[i].valor < days[i - 1].valor) {
                consecutiveDrops++;
            } else {
                consecutiveDrops = 0;
            }
        }

        if (consecutiveDrops >= 3) {
            insights.push({
                id: `declining-trend-${Date.now()}`,
                type: 'trend',
                priority: 'high',
                title: 'Tendência de queda',
                body: `Vendas em queda há ${consecutiveDrops} dias consecutivos. Analise possíveis causas.`,
                createdAt: now,
            });
        }
    }

    return insights;
}

/**
 * Generate AI-powered insights using LLM
 */
export async function generateAIInsights(context: DashboardContext): Promise<ProactiveInsight[]> {
    const runtime = await resolveAiRuntimeConfig();
    if (!runtime.apiKey) {
        return [];
    }
    const aiClient = createOpenAICompatibleClient(runtime);

    const prompt = `Analise os dados de e-commerce abaixo e identifique até 3 insights acionáveis.
Para cada insight, retorne um JSON array com objetos contendo:
- type: "opportunity" | "risk" | "trend"
- priority: "low" | "medium" | "high"
- title: string curto (max 50 chars)
- body: string explicativo (max 150 chars)

Dados:
${JSON.stringify(context, null, 2)}

Responda APENAS com o JSON array, sem texto adicional.`;

    try {
        const response = await aiClient.chat({
            messages: [{ role: 'user', content: prompt }],
            model: runtime.modelQuick,
            temperature: Math.min(runtime.temperature, 0.6),
            maxTokens: Math.min(runtime.maxTokens, 600),
        });
        const cleanJson = response.content.replace(/```json\n?|\n?```/g, '').trim();
        const parsed = JSON.parse(cleanJson) as Array<{
            type: string;
            priority: string;
            title: string;
            body: string;
        }>;

        return parsed.map((item, i) => ({
            id: `ai-insight-${Date.now()}-${i}`,
            type: (item.type as InsightType) || 'opportunity',
            priority: (item.priority as InsightPriority) || 'medium',
            title: item.title,
            body: item.body,
            createdAt: new Date().toISOString(),
        }));
    } catch (error) {
        console.error('[ProactiveInsights] Error generating AI insights:', error);
        return [];
    }
}

/**
 * Get all proactive insights (rule-based + AI)
 */
export async function getProactiveInsights(
    dashboardData: unknown,
    options?: { includeAI?: boolean }
): Promise<ProactiveInsight[]> {
    const context = buildDashboardContext(dashboardData);

    // Rule-based insights (fast, free)
    const ruleBasedInsights = detectMetricInsights(context);

    // AI insights (optional, uses tokens)
    let aiInsights: ProactiveInsight[] = [];
    if (options?.includeAI) {
        aiInsights = await generateAIInsights(context);
    }

    // Combine and sort by priority
    const priorityOrder: Record<InsightPriority, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
    };

    return [...ruleBasedInsights, ...aiInsights].sort(
        (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );
}

export default getProactiveInsights;
