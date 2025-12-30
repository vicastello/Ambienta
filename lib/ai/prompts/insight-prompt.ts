/**
 * Structured AI Insight Prompt
 * Generates actionable, specific insights
 */

export const INTELLIGENCE_SYSTEM_PROMPT = `Você é um analista sênior de e-commerce especializado em marketplaces brasileiros (Shopee, Mercado Livre, Amazon).

Sua função é analisar dados de vendas e fornecer insights ACIONÁVEIS e ESPECÍFICOS que ajudem o vendedor a tomar decisões imediatas.

## Formato de Resposta (JSON)

{
  "resumoExecutivo": {
    "manchete": "Frase de impacto curta sobre o status atual (max 70 caracteres)",
    "contexto": "Explicação em 2 frases do cenário geral com números específicos",
    "sentimento": "positivo" | "neutro" | "alerta"
  },
  "sinais": [
    {
      "titulo": "O que mudou (ex.: Faturamento, Pedidos, Ticket)",
      "valor": "Valor formatado",
      "variacao": "Ex.: +12% ou -8%",
      "tipo": "positivo" | "neutro" | "alerta",
      "origem": "Opcional (canal, produto, dia)",
      "confianca": "alta" | "media" | "baixa"
    }
  ],
  "drivers": [
    {
      "titulo": "Causa principal",
      "detalhe": "Explicação com números e comparação",
      "evidencia": "R$ / % / unidades",
      "impacto": "alto" | "medio" | "baixo",
      "tendencia": "up" | "down" | "stable",
      "origem": "canal | produto | dia | mix | frete"
    }
  ],
  "acoes": [
    {
      "titulo": "Ação prioritária",
      "motivo": "Por que fazer agora (com números)",
      "urgencia": "agora" | "hoje" | "semana" | "monitorar",
      "impacto": "alto" | "medio" | "baixo",
      "cta": "Texto curto de CTA",
      "metrica": {
        "valor": "string formatado",
        "label": "o que representa",
        "trend": "up" | "down" | "stable"
      }
    }
  ],
  "insights": [
    {
      "tipo": "urgente" | "oportunidade" | "tendencia" | "alerta",
      "prioridade": 1-5,
      "titulo": "Título conciso (max 40 caracteres)",
      "descricao": "Explicação com contexto e números (max 120 caracteres)",
      "acao": {
        "texto": "Ação específica a tomar (max 50 caracteres)",
        "urgencia": "agora" | "hoje" | "semana" | "monitorar"
      },
      "metrica": {
        "valor": "string formatado",
        "label": "o que representa",
        "trend": "up" | "down" | "stable"
      }
    }
  ],
  "projecao": {
    "texto": "Projeção baseada nos dados atuais (max 80 chars)",
    "confianca": "alta" | "media" | "baixa"
  },
  "qualidadeDados": {
    "status": "ok" | "atencao" | "critico",
    "alertas": [
      {
        "titulo": "Problema detectado",
        "detalhe": "Explicação curta",
        "acao": "Sugestão de correção"
      }
    ]
  }
}

## Regras OBRIGATÓRIAS

1. **Seja ESPECÍFICO**: 
   - ❌ "Vendas caíram" 
   - ✅ "Mercado Livre caiu 23% enquanto Shopee subiu 15%"

2. **Cada insight deve ter AÇÃO CLARA**:
   - ❌ "Monitore o estoque"
   - ✅ "Repor ESPUMA 5L - venda média 23/dia, estoque 5 unidades"

3. **Use COMPARATIVOS RELEVANTES**:
   - vs ontem, vs semana passada, vs mesmo período mês anterior
   - Cite variações percentuais

4. **Priorize por IMPACTO FINANCEIRO**:
   - O que gera mais receita?
   - O que evita maior perda?

5. **Identifique PADRÕES**:
   - Sazonalidade (dias da semana melhores/piores)
   - Tendências de crescimento/queda
   - Concentração em canais

6. **Máximo**: 4 insights, 4 ações, 4 drivers e 6 sinais (ordenados por prioridade)

7. **Formate valores monetários** como R$ XXk (milhares) ou R$ XX.XXX (sem casas decimais desnecessárias)

8. **Responda APENAS com JSON válido** - sem markdown, sem explicações extras

## Exemplos de Bons Insights

- "Shopee puxou resultado: +R$ 12k vs semana passada"
- "Quarta-feira é seu melhor dia - 35% acima da média"
- "3 produtos sem venda há 15+ dias ocupando estoque"
- "Ticket médio caiu 8% - clientes comprando menos itens por pedido"
- "Projeção: R$ 45k se mantiver ritmo atual (faltam 12 dias úteis)"`;

export const INTELLIGENCE_USER_PROMPT = `Analise os dados abaixo e gere insights acionáveis:

{context}

Lembre-se:
- Cite números específicos
- Priorize ações que gerem receita ou evitem perdas
- Considere o contexto de marketplace brasileiro
- Inclua sinais, drivers e ações priorizadas
- Reporte inconsistências em qualidadeDados
- Se houver "DB Insight Index", use-o como fonte principal e priorize os candidatos de maior impacto
- Seja direto e objetivo`;

export interface AIInsight {
    tipo: 'urgente' | 'oportunidade' | 'tendencia' | 'alerta';
    prioridade: number;
    titulo: string;
    descricao: string;
    acao: {
        texto: string;
        urgencia: 'agora' | 'hoje' | 'semana' | 'monitorar';
    };
    metrica?: {
        valor: string;
        label: string;
        trend: 'up' | 'down' | 'stable';
    };
}

export interface AIDriver {
    titulo: string;
    detalhe: string;
    evidencia?: string;
    impacto: 'alto' | 'medio' | 'baixo';
    tendencia: 'up' | 'down' | 'stable';
    origem?: string;
}

export interface AIAction {
    titulo: string;
    motivo: string;
    urgencia: 'agora' | 'hoje' | 'semana' | 'monitorar';
    impacto: 'alto' | 'medio' | 'baixo';
    cta?: string;
    metrica?: {
        valor: string;
        label: string;
        trend: 'up' | 'down' | 'stable';
    };
}

export interface AISignal {
    titulo: string;
    valor: string;
    variacao?: string;
    tipo: 'positivo' | 'neutro' | 'alerta';
    origem?: string;
    confianca?: 'alta' | 'media' | 'baixa';
}

export interface AIDataQualityAlert {
    titulo: string;
    detalhe: string;
    acao?: string;
}

export interface AIDataQuality {
    status: 'ok' | 'atencao' | 'critico';
    alertas: AIDataQualityAlert[];
}

export interface AIIntelligenceMeta {
    origem?: 'ai' | 'fallback';
    modelo?: string;
    fonteDados?: 'dashboard' | 'supabase' | 'mix';
    confianca?: 'alta' | 'media' | 'baixa';
}

export interface AIIntelligenceResponse {
    resumoExecutivo: {
        manchete: string;
        contexto: string;
        sentimento: 'positivo' | 'neutro' | 'alerta';
    };
    insights: AIInsight[];
    drivers?: AIDriver[];
    acoes?: AIAction[];
    sinais?: AISignal[];
    qualidadeDados?: AIDataQuality;
    projecao?: {
        texto: string;
        confianca: 'alta' | 'media' | 'baixa';
    };
    meta?: AIIntelligenceMeta;
    generatedAt: string;
}

const extractJsonObjectFromIndex = (value: string, start: number): string | null => {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < value.length; i += 1) {
        const char = value[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) return value.slice(start, i + 1);
        }
    }
    return null;
};

const extractJsonObject = (value: string): string | null => {
    const start = value.indexOf('{');
    if (start === -1) return null;
    return extractJsonObjectFromIndex(value, start);
};

const stripCodeFences = (value: string): string => {
    let cleaned = value.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    return cleaned.trim();
};

const repairJson = (value: string): string | null => {
    const cleaned = stripCodeFences(value.replace(/^\uFEFF/, ''));
    const start = cleaned.search(/[{[]/);
    if (start === -1) return null;

    const snippet = cleaned.slice(start);
    const stack: Array<'{' | '['> = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < snippet.length; i += 1) {
        const char = snippet[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (char === '{' || char === '[') {
            stack.push(char);
            continue;
        }
        if (char === '}' && stack[stack.length - 1] === '{') {
            stack.pop();
            continue;
        }
        if (char === ']' && stack[stack.length - 1] === '[') {
            stack.pop();
        }
    }

    let repaired = snippet;
    if (inString) {
        repaired += '"';
    }
    for (let i = stack.length - 1; i >= 0; i -= 1) {
        repaired += stack[i] === '{' ? '}' : ']';
    }
    return repaired;
};

const tryParseJson = (value: string): unknown | null => {
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'string') {
            try {
                return JSON.parse(parsed);
            } catch {
                return null;
            }
        }
        return parsed;
    } catch {
        return null;
    }
};

const parseJsonFromText = (value: string): unknown | null => {
    const cleaned = stripCodeFences(value.replace(/^\uFEFF/, ''));
    const direct = tryParseJson(cleaned);
    if (direct && typeof direct === 'object') return direct;

    const extracted = extractJsonObject(cleaned);
    const extractedParsed = extracted ? tryParseJson(extracted) : null;
    if (extractedParsed && typeof extractedParsed === 'object') return extractedParsed;

    for (let start = cleaned.indexOf('{'); start !== -1; start = cleaned.indexOf('{', start + 1)) {
        const candidate = extractJsonObjectFromIndex(cleaned, start);
        if (!candidate) continue;
        const parsed = tryParseJson(candidate);
        if (parsed && typeof parsed === 'object') return parsed;
    }

    const repaired = repairJson(cleaned);
    const repairedParsed = repaired ? tryParseJson(repaired) : null;
    if (repairedParsed && typeof repairedParsed === 'object') return repairedParsed;

    return null;
};

const logParseFailure = (rawContent: string) => {
    if (process.env.NODE_ENV === 'production') return;
    const trimmed = rawContent.trim();
    if (!trimmed) {
        console.error('[InsightPrompt] Raw response was empty');
        return;
    }
    const head = trimmed.slice(0, 400);
    const tail = trimmed.slice(-400);
    console.error('[InsightPrompt] Raw response length:', trimmed.length);
    console.error('[InsightPrompt] Raw response head:', head);
    if (trimmed.length > 800) {
        console.error('[InsightPrompt] Raw response tail:', tail);
    }
};

export function parseAIResponse(rawContent: string): AIIntelligenceResponse {
    try {
        const parsedRaw = parseJsonFromText(rawContent);
        const parsed = Array.isArray(parsedRaw) ? { insights: parsedRaw } : parsedRaw;

        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Resposta de IA inválida');
        }

        // Validate and sanitize response
        const response: AIIntelligenceResponse = {
            resumoExecutivo: {
                manchete: String(parsed.resumoExecutivo?.manchete || 'Análise em andamento').substring(0, 70),
                contexto: String(parsed.resumoExecutivo?.contexto || '').substring(0, 200),
                sentimento: ['positivo', 'neutro', 'alerta'].includes(parsed.resumoExecutivo?.sentimento)
                    ? parsed.resumoExecutivo.sentimento
                    : 'neutro',
            },
            insights: [],
            drivers: [],
            acoes: [],
            sinais: [],
            generatedAt: new Date().toISOString(),
        };

        const normalizeImpacto = (value: unknown): 'alto' | 'medio' | 'baixo' => {
            if (value === 'alto' || value === 'medio' || value === 'baixo') return value;
            return 'medio';
        };

        const normalizeTrend = (value: unknown): 'up' | 'down' | 'stable' => {
            if (value === 'up' || value === 'down' || value === 'stable') return value;
            return 'stable';
        };

        const normalizeUrgencia = (value: unknown): 'agora' | 'hoje' | 'semana' | 'monitorar' => {
            if (value === 'agora' || value === 'hoje' || value === 'semana' || value === 'monitorar') return value;
            return 'monitorar';
        };

        const normalizeSentimento = (value: unknown): 'positivo' | 'neutro' | 'alerta' => {
            if (value === 'positivo' || value === 'neutro' || value === 'alerta') return value;
            return 'neutro';
        };

        // Parse insights
        if (Array.isArray(parsed.insights)) {
            response.insights = parsed.insights.slice(0, 4).map((i: any) => ({
                tipo: ['urgente', 'oportunidade', 'tendencia', 'alerta'].includes(i.tipo) ? i.tipo : 'alerta',
                prioridade: Math.min(5, Math.max(1, Number(i.prioridade) || 3)),
                titulo: String(i.titulo || '').substring(0, 40),
                descricao: String(i.descricao || '').substring(0, 120),
                acao: {
                    texto: String(i.acao?.texto || 'Ver detalhes').substring(0, 50),
                    urgencia: ['agora', 'hoje', 'semana', 'monitorar'].includes(i.acao?.urgencia)
                        ? i.acao.urgencia
                        : 'monitorar',
                },
                metrica: i.metrica ? {
                    valor: String(i.metrica.valor || ''),
                    label: String(i.metrica.label || ''),
                    trend: ['up', 'down', 'stable'].includes(i.metrica.trend) ? i.metrica.trend : 'stable',
                } : undefined,
            }));
        }

        const driversRaw = Array.isArray(parsed.drivers)
            ? parsed.drivers
            : Array.isArray(parsed.driversPrincipais)
                ? parsed.driversPrincipais
                : [];
        if (driversRaw.length) {
            response.drivers = driversRaw.slice(0, 4).map((d: any) => ({
                titulo: String(d.titulo || d.title || '').substring(0, 60),
                detalhe: String(d.detalhe || d.detail || '').substring(0, 160),
                evidencia: d.evidencia ? String(d.evidencia).substring(0, 80) : undefined,
                impacto: normalizeImpacto(d.impacto),
                tendencia: normalizeTrend(d.tendencia),
                origem: d.origem ? String(d.origem).substring(0, 40) : undefined,
            }));
        }

        const actionsRaw = Array.isArray(parsed.acoes)
            ? parsed.acoes
            : Array.isArray(parsed.actions)
                ? parsed.actions
                : [];
        if (actionsRaw.length) {
            response.acoes = actionsRaw.slice(0, 4).map((a: any) => ({
                titulo: String(a.titulo || a.title || '').substring(0, 60),
                motivo: String(a.motivo || a.reason || '').substring(0, 160),
                urgencia: normalizeUrgencia(a.urgencia),
                impacto: normalizeImpacto(a.impacto),
                cta: a.cta ? String(a.cta).substring(0, 40) : undefined,
                metrica: a.metrica ? {
                    valor: String(a.metrica.valor || ''),
                    label: String(a.metrica.label || ''),
                    trend: normalizeTrend(a.metrica.trend),
                } : undefined,
            }));
        }

        const signalsRaw = Array.isArray(parsed.sinais)
            ? parsed.sinais
            : Array.isArray(parsed.signals)
                ? parsed.signals
                : [];
        if (signalsRaw.length) {
            response.sinais = signalsRaw.slice(0, 6).map((s: any) => ({
                titulo: String(s.titulo || s.title || '').substring(0, 40),
                valor: String(s.valor || s.value || '').substring(0, 40),
                variacao: s.variacao ? String(s.variacao).substring(0, 20) : undefined,
                tipo: normalizeSentimento(s.tipo),
                origem: s.origem ? String(s.origem).substring(0, 40) : undefined,
                confianca: s.confianca === 'alta' || s.confianca === 'media' || s.confianca === 'baixa'
                    ? s.confianca
                    : undefined,
            }));
        }

        const qualityRaw = parsed.qualidadeDados || parsed.dataQuality;
        if (qualityRaw && typeof qualityRaw === 'object') {
            const alertasRaw = Array.isArray((qualityRaw as any).alertas) ? (qualityRaw as any).alertas : [];
            response.qualidadeDados = {
                status: (qualityRaw as any).status === 'ok' || (qualityRaw as any).status === 'atencao' || (qualityRaw as any).status === 'critico'
                    ? (qualityRaw as any).status
                    : 'atencao',
                alertas: alertasRaw.slice(0, 4).map((alerta: any) => ({
                    titulo: String(alerta.titulo || alerta.title || '').substring(0, 60),
                    detalhe: String(alerta.detalhe || alerta.detail || '').substring(0, 160),
                    acao: alerta.acao ? String(alerta.acao).substring(0, 80) : undefined,
                })),
            };
        }

        // Parse projection
        if (parsed.projecao) {
            response.projecao = {
                texto: String(parsed.projecao.texto || '').substring(0, 80),
                confianca: ['alta', 'media', 'baixa'].includes(parsed.projecao.confianca)
                    ? parsed.projecao.confianca
                    : 'media',
            };
        }

        const metaRaw = parsed.meta || parsed.metadados;
        if (metaRaw && typeof metaRaw === 'object') {
            response.meta = {
                origem: metaRaw.origem === 'ai' || metaRaw.origem === 'fallback' ? metaRaw.origem : undefined,
                modelo: metaRaw.modelo ? String(metaRaw.modelo).substring(0, 80) : undefined,
                fonteDados: metaRaw.fonteDados === 'dashboard' || metaRaw.fonteDados === 'supabase' || metaRaw.fonteDados === 'mix'
                    ? metaRaw.fonteDados
                    : undefined,
                confianca: metaRaw.confianca === 'alta' || metaRaw.confianca === 'media' || metaRaw.confianca === 'baixa'
                    ? metaRaw.confianca
                    : undefined,
            };
        }

        return response;

    } catch (error) {
        console.error('[InsightPrompt] Failed to parse AI response:', error);
        logParseFailure(rawContent);

        // Return fallback response
        return {
            resumoExecutivo: {
                manchete: 'Análise em processamento',
                contexto: 'Não foi possível gerar insights neste momento. Tente novamente.',
                sentimento: 'neutro',
            },
            insights: [],
            generatedAt: new Date().toISOString(),
        };
    }
}
