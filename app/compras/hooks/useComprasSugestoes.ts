'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getErrorMessage } from '@/lib/errors';
import type { Sugestao, ProdutoDerivado } from '../types';

const COMPRAS_RECALC_DEBOUNCE_MS = 350;
const DAYS_PER_MONTH = 30;
const DEFAULT_PERIOD_DIAS = 60;
const DEFAULT_COBERTURA_DIAS = 15;
const MIN_COBERTURA_DIAS = 15;
const MAX_COBERTURA_DIAS = 180;

export type UseComprasSugestoesOptions = {
    /**
     * Se fornecido, dados pré-carregados; não faz fetch inicial.
     */
    initialData?: Sugestao[];
    /**
     * Overrides de quantidade para sugestao_ajustada
     */
    pedidoOverrides?: Record<number, number>;
};

export type UseComprasSugestoesReturn = {
    // Estados principais
    dados: Sugestao[];
    setDados: React.Dispatch<React.SetStateAction<Sugestao[]>>;
    loading: boolean;
    erro: string | null;
    lastUpdatedAt: string | null;

    // Parâmetros de cálculo
    periodDays: number;
    targetDays: number;
    setPeriodDays: React.Dispatch<React.SetStateAction<number>>;
    setTargetDays: React.Dispatch<React.SetStateAction<number>>;
    handlePeriodInput: (value: string) => void;
    handleCoverageInput: (value: string) => void;

    // Derivados com cálculo ABC
    derivados: ProdutoDerivado[];

    // Ações
    load: () => Promise<void>;

    // Ref para acesso quando necessário
    dadosRef: React.MutableRefObject<Sugestao[]>;
};

export function useComprasSugestoes(options?: UseComprasSugestoesOptions): UseComprasSugestoesReturn {
    const [periodDays, setPeriodDays] = useState(DEFAULT_PERIOD_DIAS);
    const [targetDays, setTargetDays] = useState(DEFAULT_COBERTURA_DIAS);
    const [dados, setDados] = useState<Sugestao[]>(options?.initialData ?? []);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const dadosRef = useRef<Sugestao[]>([]);

    // Mantém ref sincronizado
    useEffect(() => {
        dadosRef.current = dados;
    }, [dados]);

    const handlePeriodInput = useCallback((value: string) => {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed >= 1) {
            setPeriodDays(parsed);
        }
    }, []);

    const handleCoverageInput = useCallback((value: string) => {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed >= MIN_COBERTURA_DIAS && parsed <= MAX_COBERTURA_DIAS) {
            setTargetDays(parsed);
        }
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setErro(null);
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const res = await fetch(
                `/api/compras/sugestoes?periodDays=${periodDays}&targetMonths=${Number((targetDays / DAYS_PER_MONTH).toFixed(2))}`,
                { cache: 'no-store', signal: controller.signal }
            );
            if (!res.ok) throw new Error('Erro ao carregar sugestões');
            const json = await res.json();
            const produtosNormalizados: Sugestao[] = (json.produtos || []).map((item: Sugestao) => ({
                ...item,
                embalagem_qtd: Math.max(Number(item.embalagem_qtd) || 1, 1),
                observacao_compras: item.observacao_compras ?? null,
            }));
            setDados(produtosNormalizados);
            setLastUpdatedAt(new Date().toISOString());
        } catch (error: unknown) {
            if ((error as DOMException)?.name === 'AbortError') {
                return;
            }
            setErro(getErrorMessage(error) ?? 'Erro inesperado');
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
            setLoading(false);
        }
    }, [periodDays, targetDays]);

    // Auto-load debounced quando parâmetros mudam
    useEffect(() => {
        const timeout = setTimeout(() => {
            void load();
        }, COMPRAS_RECALC_DEBOUNCE_MS);
        return () => clearTimeout(timeout);
    }, [load]);

    // Derivados base sem filtro (filtro será aplicado em useComprasFilters)
    const pedidoOverrides = options?.pedidoOverrides ?? {};
    const derivados = useMemo<ProdutoDerivado[]>(() => {
        // Etapa 1: Calcular métricas base de cada produto
        const produtosBase = dados.map((p, index) => {
            const pack = Math.max(p.embalagem_qtd || 1, 1);
            const consumoMensal = Math.max(p.consumo_mensal || 0, 0);
            const consumoDiario = consumoMensal / DAYS_PER_MONTH;
            const pontoMinimo = consumoDiario * targetDays;
            const estoqueAtual = Math.max(p.disponivel ?? 0, 0);
            const precisaRepor = pontoMinimo > 0 ? estoqueAtual < pontoMinimo : false;
            const quantidadeNecessaria = precisaRepor ? Math.max(pontoMinimo - estoqueAtual, 0) : 0;
            const quantidadeFinal = precisaRepor && quantidadeNecessaria > 0 ? Math.ceil(quantidadeNecessaria / pack) * pack : 0;
            const alerta = precisaRepor && quantidadeNecessaria > 0 && quantidadeNecessaria < pack;
            const coberturaAtualDias = consumoDiario > 0 ? estoqueAtual / consumoDiario : null;
            const necessarioLabel = Math.ceil(Math.max(quantidadeNecessaria, 0)).toLocaleString('pt-BR');
            const statusCobertura = precisaRepor
                ? `Cobertura insuficiente — faltam ${necessarioLabel} unid. para ${targetDays} dias.`
                : 'Abaixo do lote, mas ainda dentro da cobertura — não comprar agora.';
            const diasAteRuptura = consumoDiario > 0 ? Math.floor(estoqueAtual / consumoDiario) : null;
            // Valor mensal para classificação ABC (consumo * preço)
            const valorMensal = consumoMensal * (p.preco_custo || 0);

            // Aplicar override se existir
            const overrideValue = pedidoOverrides[p.id_produto_tiny];
            const quantidadeFinalAjustada = Number.isFinite(overrideValue)
                ? Math.max(0, Number(overrideValue))
                : quantidadeFinal;

            return {
                ...p,
                embalagem_qtd: pack,
                consumoDiario,
                pontoMinimo,
                coberturaAtualDias,
                precisaRepor,
                quantidadeNecessaria,
                sugestao_calculada: quantidadeFinal,
                sugestao_ajustada: quantidadeFinalAjustada,
                alerta_embalagem: alerta,
                statusCobertura,
                total_valor_calculado: quantidadeFinalAjustada * (p.preco_custo || 0),
                originalIndex: index,
                diasAteRuptura,
                valorMensal, // campo temporário para cálculo ABC
            };
        });

        // Etapa 2: Calcular Curva ABC baseado no valor mensal
        const valorTotal = produtosBase.reduce((acc, p) => acc + p.valorMensal, 0);
        if (valorTotal === 0) {
            // Sem dados de valor, todos são C
            return produtosBase.map(({ valorMensal: _, ...rest }) => ({ ...rest, curvaABC: 'C' as const }));
        }

        // Ordenar por valor decrescente para calcular percentual acumulado
        const ordenadosPorValor = [...produtosBase].sort((a, b) => b.valorMensal - a.valorMensal);
        const abcMap = new Map<number, 'A' | 'B' | 'C'>();
        let acumulado = 0;

        for (const produto of ordenadosPorValor) {
            acumulado += produto.valorMensal;
            const percentual = acumulado / valorTotal;
            if (percentual <= 0.8) {
                abcMap.set(produto.id_produto_tiny, 'A');
            } else if (percentual <= 0.95) {
                abcMap.set(produto.id_produto_tiny, 'B');
            } else {
                abcMap.set(produto.id_produto_tiny, 'C');
            }
        }

        // Retornar produtos na ordem original com classificação ABC
        return produtosBase.map(({ valorMensal: _, ...rest }) => ({
            ...rest,
            curvaABC: abcMap.get(rest.id_produto_tiny) ?? 'C',
        }));
    }, [dados, targetDays, pedidoOverrides]);

    return {
        dados,
        setDados,
        loading,
        erro,
        lastUpdatedAt,
        periodDays,
        targetDays,
        setPeriodDays,
        setTargetDays,
        handlePeriodInput,
        handleCoverageInput,
        derivados,
        load,
        dadosRef,
    };
}
