'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Save, RotateCcw, TrendingUp, DollarSign } from 'lucide-react';

const DEFAULT_MARGEM_BRUTA = 37;
const DEFAULT_DESPESAS_OP = 17;

export default function ConfigFinanceiro() {
    const [margemBruta, setMargemBruta] = useState(DEFAULT_MARGEM_BRUTA);
    const [despesasOp, setDespesasOp] = useState(DEFAULT_DESPESAS_OP);
    const [margemLiquida, setMargemLiquida] = useState(0);

    useEffect(() => {
        // Carregar de localStorage
        const saved = localStorage.getItem('config_financeiro');
        if (saved) {
            try {
                const { margemBruta, despesasOp } = JSON.parse(saved);
                setMargemBruta(margemBruta ?? DEFAULT_MARGEM_BRUTA);
                setDespesasOp(despesasOp ?? DEFAULT_DESPESAS_OP);
            } catch (e) {
                console.error('Erro ao carregar configurações:', e);
            }
        }
    }, []);

    useEffect(() => {
        // Calcular margem líquida estimada
        setMargemLiquida(margemBruta - despesasOp);
    }, [margemBruta, despesasOp]);

    const handleSalvar = () => {
        const config = { margemBruta, despesasOp };
        localStorage.setItem('config_financeiro', JSON.stringify(config));
        toast.success('Configurações salvas!', {
            description: 'A dashboard será atualizada automaticamente',
        });
    };

    const handleResetar = () => {
        setMargemBruta(DEFAULT_MARGEM_BRUTA);
        setDespesasOp(DEFAULT_DESPESAS_OP);
        localStorage.removeItem('config_financeiro');
        toast.success('Valores resetados para padrão', {
            description: `Margem: ${DEFAULT_MARGEM_BRUTA}% | Despesas: ${DEFAULT_DESPESAS_OP}%`,
        });
    };

    return (
        <div className="space-y-8">
            {/* Margem Bruta */}
            <div>
                <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
                        <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                        <label className="block text-lg font-semibold text-main">
                            Margem Bruta
                        </label>
                        <p className="text-xs text-muted">
                            Receita líquida menos custo de produtos vendidos (CMV)
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={margemBruta}
                        onChange={(e) => setMargemBruta(parseFloat(e.target.value) || 0)}
                        className="glass-panel px-4 py-3 rounded-2xl text-2xl font-bold text-main w-32 text-center focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <span className="text-2xl font-bold text-muted">%</span>
                    <div className="flex-1 text-sm text-muted">
                        <p>Padrão e-commerce: 35-40%</p>
                    </div>
                </div>
            </div>

            {/* Despesas Operacionais */}
            <div>
                <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-500/10">
                        <DollarSign className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                        <label className="block text-lg font-semibold text-main">
                            Despesas Operacionais
                        </label>
                        <p className="text-xs text-muted">
                            Marketing, pessoal, logística, infraestrutura, etc.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={despesasOp}
                        onChange={(e) => setDespesasOp(parseFloat(e.target.value) || 0)}
                        className="glass-panel px-4 py-3 rounded-2xl text-2xl font-bold text-main w-32 text-center focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <span className="text-2xl font-bold text-muted">%</span>
                    <div className="flex-1 text-sm text-muted">
                        <p>Padrão e-commerce: 15-20%</p>
                    </div>
                </div>
            </div>

            {/* Preview Margem Líquida */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20">
                <p className="text-sm font-medium text-muted mb-2">
                    Margem Líquida Estimada
                </p>
                <p className="text-4xl font-bold text-accent">
                    {margemLiquida.toFixed(1)}%
                </p>
                <p className="text-xs text-muted mt-2">
                    Margem Bruta ({margemBruta}%) - Despesas Op ({despesasOp}%)
                </p>
            </div>

            {/* Botões */}
            <div className="flex flex-wrap gap-3 pt-4">
                <button
                    onClick={handleSalvar}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-accent hover:bg-accent-dark text-white font-semibold transition-all"
                >
                    <Save className="w-5 h-5" />
                    Salvar Configurações
                </button>
                <button
                    onClick={handleResetar}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl glass-panel hover:bg-white/10 dark:hover:bg-white/5 text-main font-semibold transition-all"
                >
                    <RotateCcw className="w-5 h-5" />
                    Resetar para Padrão
                </button>
            </div>

            {/* Nota informativa */}
            <div className="p-5 rounded-2xl bg-blue-50/50 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20">
                <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                    💡 <strong>Dica:</strong> Estes valores serão usados para calcular
                    o Lucro Líquido na <strong>Visão Executiva</strong> da dashboard.
                    Configure com base nos seus dados contábeis reais para maior precisão.
                    Os valores são salvos localmente no seu navegador.
                </p>
            </div>
        </div>
    );
}
