/**
 * System Prompt for Ambienta Copilot
 */

export const COPILOT_SYSTEM_PROMPT = `Você é o **Copilot da Ambienta**, um assistente de IA especializado em gestão de e-commerce.

## Personalidade
- Profissional mas acessível
- Direto ao ponto, respostas concisas
- Usa dados concretos para embasar análises
- Proativo em sugerir ações

## Formatação
- Use **negrito** para números importantes
- Use emojis com moderação: ⚠️ alerta, 💡 dica, 📊 dados, ✅ positivo, ❌ negativo
- Estruture em listas quando houver múltiplos itens
- Limite respostas a 250 palavras

## Capacidades
1. Análise de vendas e tendências
2. Comparativos entre canais (Shopee, Mercado Livre, etc)
3. Alertas de estoque baixo
4. Identificação de oportunidades e riscos
5. Resumos executivos

## Limitações (seja transparente)
- Dados são do período informado no contexto
- Não tenho acesso a dados de concorrentes
- Previsões são estimativas baseadas em histórico

## Formato de Resposta
Responda sempre em português brasileiro.
Quando citar valores monetários, use o formato R$ X.XXX,XX.
Quando houver ações sugeridas, liste-as claramente.`;

/**
 * Context template for dashboard data
 */
export function buildDashboardContextPrompt(data: {
    faturamento?: number;
    pedidos?: number;
    ticketMedio?: number;
    canais?: Array<{ nome: string; valor: number; pedidos: number }>;
    topProdutos?: Array<{ nome: string; qtd: number; valor: number }>;
    ultimos7Dias?: Array<{ data: string; valor: number; qtd: number }>;
    comparativo?: { faturamento?: number | null; pedidos?: number | null; ticket?: number | null };
    periodo?: { inicio: string; fim: string };
}): string {
    const parts: string[] = ['## Dados do Dashboard\n'];

    if (data.periodo) {
        parts.push(`**Período**: ${data.periodo.inicio} a ${data.periodo.fim}\n`);
    }

    if (data.faturamento !== undefined) {
        parts.push(`**Faturamento**: R$ ${data.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    }
    if (data.pedidos !== undefined) {
        parts.push(`**Pedidos**: ${data.pedidos}`);
    }
    if (data.ticketMedio !== undefined) {
        parts.push(`**Ticket Médio**: R$ ${data.ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    }

    if (data.comparativo) {
        const comp = data.comparativo;
        const items: string[] = [];
        if (comp.faturamento != null) items.push(`Faturamento: ${comp.faturamento >= 0 ? '+' : ''}${comp.faturamento.toFixed(1)}%`);
        if (comp.pedidos != null) items.push(`Pedidos: ${comp.pedidos >= 0 ? '+' : ''}${comp.pedidos.toFixed(1)}%`);
        if (comp.ticket != null) items.push(`Ticket: ${comp.ticket >= 0 ? '+' : ''}${comp.ticket.toFixed(1)}%`);
        if (items.length) {
            parts.push(`\n**Variação vs período anterior**: ${items.join(' | ')}`);
        }
    }

    if (data.canais?.length) {
        parts.push('\n### Vendas por Canal');
        data.canais.forEach((c, i) => {
            parts.push(`${i + 1}. **${c.nome}**: R$ ${c.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${c.pedidos} pedidos)`);
        });
    }

    if (data.topProdutos?.length) {
        parts.push('\n### Top Produtos');
        data.topProdutos.forEach((p, i) => {
            parts.push(`${i + 1}. ${p.nome}: ${p.qtd}un - R$ ${p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        });
    }

    if (data.ultimos7Dias?.length) {
        parts.push('\n### Últimos 7 dias');
        data.ultimos7Dias.forEach(d => {
            parts.push(`- ${d.data}: R$ ${d.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${d.qtd} pedidos)`);
        });
    }

    return parts.join('\n');
}

/**
 * Suggested prompts for the copilot
 */
export const SUGGESTED_PROMPTS = [
    {
        id: 'resumo',
        label: 'Resumo do período',
        prompt: 'Faça um resumo executivo do período atual, destacando os principais pontos positivos e de atenção.',
    },
    {
        id: 'top-produtos',
        label: 'Top produtos',
        prompt: 'Quais são meus produtos mais vendidos e qual a participação deles no faturamento?',
    },
    {
        id: 'comparar-canais',
        label: 'Comparar canais',
        prompt: 'Compare o desempenho dos meus canais de venda. Qual está crescendo mais?',
    },
    {
        id: 'oportunidades',
        label: 'Oportunidades',
        prompt: 'Identifique as principais oportunidades de crescimento com base nos dados.',
    },
    {
        id: 'riscos',
        label: 'Riscos',
        prompt: 'Quais são os principais riscos ou problemas que preciso ficar atento?',
    },
];

export default COPILOT_SYSTEM_PROMPT;
