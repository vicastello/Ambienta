
import React from 'react';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';

type FornecedorOption = {
    value: string;
    label: string;
};

type FilterBarProps = {
    produtoFiltro: string;
    setProdutoFiltro: (value: string) => void;
    fornecedoresSelecionados: string[];
    setFornecedoresSelecionados: (values: string[]) => void;
    fornecedorOptions: FornecedorOption[];
    fornecedorDisplayFormatter: (values: (string | number)[], options: Array<{ value: string | number; label: string }>) => string;
};

export function FilterBar({
    produtoFiltro,
    setProdutoFiltro,
    fornecedoresSelecionados,
    setFornecedoresSelecionados,
    fornecedorOptions,
    fornecedorDisplayFormatter,
}: FilterBarProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-5 space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
                    <span>Filtro de produto</span>
                    <span className="text-[10px] tracking-[0.2em] text-slate-400">Busca inteligente</span>
                </div>
                <p className="text-xs text-slate-500">Busque por nome, SKU ou EAN</p>
                <div className="w-full">
                    <input
                        className="app-input w-full"
                        placeholder="Ex: Floreira, 1234, 789..."
                        value={produtoFiltro}
                        onChange={(e) => setProdutoFiltro(e.target.value)}
                    />
                </div>
            </div>
            <div className="rounded-[24px] glass-panel p-4 sm:p-5 space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
                    <span>Filtro de fornecedor</span>
                    <span className="text-[10px] tracking-[0.2em] text-slate-400">Inclui &quot;Sem fornecedor&quot;</span>
                </div>
                <p className="text-xs text-slate-500">Selecione um ou mais parceiros para focar o planejamento.</p>
                <MultiSelectDropdown
                    label="Fornecedores"
                    options={fornecedorOptions}
                    selected={fornecedoresSelecionados}
                    onChange={(values) => setFornecedoresSelecionados(values.map(String))}
                    onClear={() => setFornecedoresSelecionados([])}
                    displayFormatter={fornecedorDisplayFormatter}
                    showLabel={false}
                />
            </div>
        </div>
    );
}
