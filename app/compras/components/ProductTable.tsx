
import React, { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    Loader2,
    CheckCircle2,
    AlertCircle,
    ChevronsUpDown,
    ChevronUp,
    ChevronDown,
} from 'lucide-react';
import {
    ProdutoDerivado,
    ManualItem,
    AutoSavePayload,
    EstoqueSnapshot,
    SortKey,
    SortDirection,
} from '../types';

type ProductTableProps = {
    products: ProdutoDerivado[];
    manualItems: ManualItem[];
    selectedIds: Record<number, boolean>;
    onToggleSelection: (id: number) => void;
    estoqueLive: Record<number, EstoqueSnapshot>;
    estoqueLoading: Record<number, boolean>;
    onRefreshEstoque: (id: number) => void;
    pedidoOverrides: Record<number, number>;
    pedidoInputDrafts: Record<number, string>;
    onPedidoChange: (id: number, value: string, calculated: number) => void;
    onPedidoBlur: (id: number) => void;
    onUpdateObservacao: (id: number, val: string) => void;
    onUpdateFornecedor: (id: number, val: string) => void;
    onUpdateEmbalagem: (id: number, val: number) => void;
    onUpdateLeadTime: (id: number, val: number) => void;
    syncStatus: Record<number, 'saving' | 'saved' | 'error'>;
    onRetrySave: (id: number) => void;
    sortConfig: Array<{ key: SortKey; direction: SortDirection }>;
    onToggleSort: (key: SortKey) => void;
    formatFornecedorNome: (name: string | null) => string | null;
    sanitizeFornecedor: (val: string) => string | null;
    sanitizeEmbalagem: (val: number) => number | null;
    sanitizeObservacao: (val: string) => string | null;
};

// Helper for recency
const formatRecency = (iso?: string | null) => {
    if (!iso) return null;
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return null;
    const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    if (diffMin < 1) return 'agora';
    if (diffMin === 1) return 'há 1 min';
    if (diffMin < 60) return `há ${diffMin} min`;
    const hours = Math.floor(diffMin / 60);
    return `há ${hours}h`;
};

export function ProductTable({
    products,
    manualItems,
    selectedIds,
    onToggleSelection,
    estoqueLive,
    estoqueLoading,
    onRefreshEstoque,
    pedidoOverrides,
    pedidoInputDrafts,
    onPedidoChange,
    onPedidoBlur,
    onUpdateObservacao,
    onUpdateFornecedor,
    onUpdateEmbalagem,
    onUpdateLeadTime,
    syncStatus,
    onRetrySave,
    sortConfig,
    onToggleSort,
    formatFornecedorNome,
    sanitizeFornecedor,
    sanitizeEmbalagem,
    sanitizeObservacao,
}: ProductTableProps) {
    const parentRef = useRef<HTMLDivElement>(null);

    type RowItem =
        | { type: 'product'; data: ProdutoDerivado }
        | { type: 'manual'; data: ManualItem };

    const allItems = useMemo<RowItem[]>(() => {
        const p: RowItem[] = products.map(x => ({ type: 'product', data: x }));
        const m: RowItem[] = manualItems.map(x => ({ type: 'manual', data: x }));
        return [...p, ...m];
    }, [products, manualItems]);

    const rowVirtualizer = useVirtualizer({
        count: allItems.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 64, // Reduced estimate slightly
        overscan: 5,
    });

    const getAriaSort = (key: SortKey): 'none' | 'ascending' | 'descending' => {
        const entry = sortConfig.find((item) => item.key === key);
        if (!entry) return 'none';
        return entry.direction === 'asc' ? 'ascending' : 'descending';
    };

    const renderSortIcon = (key: SortKey) => {
        const entryIndex = sortConfig.findIndex((item) => item.key === key);
        const isActive = entryIndex !== -1;
        const baseClass = `w-3.5 h-3.5 ${isActive ? 'text-[var(--accent)]' : 'opacity-40'}`;
        if (!isActive) {
            return <ChevronsUpDown className={baseClass} aria-hidden />;
        }
        const direction = sortConfig[entryIndex].direction;
        const IconComponent = direction === 'desc' ? ChevronDown : ChevronUp;
        return (
            <span className="inline-flex items-center gap-1">
                <IconComponent className={baseClass} aria-hidden />
                {sortConfig.length > 1 && (
                    <span className="text-[10px] font-semibold text-[var(--accent)]">{entryIndex + 1}</span>
                )}
            </span>
        );
    };

    const renderSortableHeader = (label: string, key: SortKey, width: string, align: 'left' | 'right' = 'left', stickyLeft?: string) => {
        const style: React.CSSProperties = {
            width,
            minWidth: width,
            maxWidth: width,
            ...(stickyLeft
                ? { position: 'sticky', top: 0, left: stickyLeft, zIndex: 30 }
                : { position: 'sticky', top: 0, zIndex: 20 }
            )
        };

        // Ensure solid background with !important (using !) and high opacity
        const baseBg = '!bg-slate-50 dark:!bg-slate-900';
        const stickyBg = stickyLeft ? '!bg-slate-50 dark:!bg-slate-900 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]' : baseBg;
        const stickyClass = `${stickyBg} border-b border-slate-200 dark:border-slate-800`;

        return (
            <th className={`px-3 py-2 text-${align} ${stickyClass} align-bottom`} style={style} aria-sort={getAriaSort(key)}>
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onToggleSort(key)}
                    className={`flex items-end gap-1 text-inherit uppercase tracking-[0.05em] font-semibold cursor-pointer focus:outline-none group ${align === 'right' ? 'justify-end text-right' : 'text-left'}`}
                    aria-label={`Ordenar coluna ${label}`}
                >
                    <span className="whitespace-normal leading-tight">{label}</span>
                    <span className="shrink-0 mb-0.5">{renderSortIcon(key)}</span>
                </div>
            </th>
        );
    };

    const virtualItems = rowVirtualizer.getVirtualItems();
    const totalSize = rowVirtualizer.getTotalSize();
    const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
    const paddingBottom = virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;

    return (
        <div ref={parentRef} className="overflow-auto scrollbar-hide h-full relative">
            <table className="w-full text-sm border-separate border-spacing-0 table-fixed">
                <thead className="app-table-header text-[10px] uppercase tracking-[0.05em] text-slate-500 bg-slate-50 dark:bg-slate-900 shadow-sm relative z-50">
                    <tr>
                        <th className="px-3 py-2 text-left w-[50px] sticky top-0 left-0 z-30 !bg-slate-50 dark:!bg-slate-900 align-bottom border-b border-slate-200 dark:border-slate-800">
                            <span className="sr-only">Selecionar</span>
                        </th>
                        {/* Frozen Columns */}
                        {renderSortableHeader('Produto', 'nome', '360px', 'left', '50px')}
                        {renderSortableHeader('SKU', 'codigo', '110px', 'left', '410px')}
                        {renderSortableHeader('Código fornecedor', 'fornecedor_codigo', '130px', 'left', '520px')}
                        {renderSortableHeader('Emb.', 'embalagem_qtd', '70px', 'right', '650px')}

                        {/* Scrolling Columns */}
                        <th className="px-3 py-2 text-right min-w-[70px] w-[70px] align-bottom sticky top-0 z-20 !bg-slate-50 dark:!bg-slate-900 border-b border-slate-200 dark:border-slate-800" title="Lead Time (dias de entrega do fornecedor)">LT</th>
                        {renderSortableHeader('Estoque disp.', 'disponivel', '100px', 'right')}
                        {renderSortableHeader('Dias Rupt.', 'diasAteRuptura', '80px', 'right')}
                        {renderSortableHeader('Consumo período', 'consumo_periodo', '100px', 'right')}
                        {renderSortableHeader('Consumo mensal', 'consumo_mensal', '100px', 'right')}
                        {renderSortableHeader('Pedido (sugestão)', 'sugestao_base', '100px', 'right')}
                        {renderSortableHeader('Pedido final', 'sugestao_ajustada', '110px', 'right')}
                        <th className="px-3 py-2 text-right sticky top-0 z-20 min-w-[120px] w-[120px] align-bottom !bg-slate-50 dark:!bg-slate-900 border-b border-slate-200 dark:border-slate-800">Custo Unit.</th>
                        <th className="px-3 py-2 text-right sticky top-0 z-20 min-w-[120px] w-[120px] align-bottom !bg-slate-50 dark:!bg-slate-900 border-b border-slate-200 dark:border-slate-800">Total</th>
                        <th className="px-3 py-2 text-left sticky top-0 z-20 min-w-[220px] w-[220px] align-bottom !bg-slate-50 dark:!bg-slate-900 border-b border-slate-200 dark:border-slate-800">Observações (PDF)</th>
                        <th className="px-3 py-2 text-left sticky top-0 z-20 min-w-[140px] w-[140px] align-bottom !bg-slate-50 dark:!bg-slate-900 border-b border-slate-200 dark:border-slate-800">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/30 dark:divide-white/5">
                    {paddingTop > 0 && <tr><td colSpan={16} style={{ height: `${paddingTop}px` }} /></tr>}

                    {virtualItems.map((virtualRow) => {
                        const item = allItems[virtualRow.index];

                        if (item.type === 'manual') {
                            const m = item.data;
                            return (
                                <tr key={`manual-item-${m.id}`} className="align-middle bg-white/50 dark:bg-white/10">
                                    <td className="px-3 py-2 w-[50px] align-middle text-center sticky left-0 z-10 bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur-sm">
                                        <button
                                            type="button"
                                            role="checkbox"
                                            aria-checked={Boolean(selectedIds[m.id])}
                                            className={`app-checkbox ${selectedIds[m.id] ? 'checked' : ''}`}
                                            onClick={() => onToggleSelection(m.id)}
                                        >
                                            <span aria-hidden className="app-checkbox-indicator" />
                                            <span className="sr-only">{selectedIds[m.id] ? 'Desmarcar' : 'Selecionar'} item manual</span>
                                        </button>
                                    </td>
                                    <td className="px-3 py-2 sticky left-[50px] z-10 bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur-sm" style={{ width: '360px', minWidth: '360px', maxWidth: '360px' }}>
                                        <div>
                                            <div className="font-semibold text-slate-900 dark:text-white truncate">{m.nome}</div>
                                            <p className="text-[11px] text-slate-500">Cadastro manual</p>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-center text-slate-500 dark:text-slate-400 sticky left-[410px] z-10 bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur-sm" style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>—</td>
                                    <td className="px-3 py-2 sticky left-[520px] z-10 bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur-sm" style={{ width: '130px', minWidth: '130px', maxWidth: '130px' }}>
                                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate" title={m.fornecedor_codigo}>{m.fornecedor_codigo}</div>
                                    </td>
                                    <td colSpan={7} className="text-center text-slate-300 dark:text-slate-600">—</td>
                                    <td className="px-3 py-2 font-semibold text-emerald-600 dark:text-emerald-400 text-right sticky left-[650px] z-10 bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur-sm" style={{ width: '70px', minWidth: '70px', maxWidth: '70px' }}>
                                        {m.quantidade}
                                    </td>
                                    <td colSpan={2} className="text-center text-slate-300 dark:text-slate-600 sticky min-w-[120px]">—</td>
                                    <td className="px-3 py-2 min-w-[120px]">
                                        <span className="text-sm text-slate-600 dark:text-slate-300 truncate block" title={m.observacao}>{m.observacao}</span>
                                    </td>
                                    <td className="px-3 py-2 min-w-[140px]" />
                                </tr>
                            );
                        }

                        // Normal Product Row
                        const p = item.data;
                        const fornecedorNomeFormatado = formatFornecedorNome(p.fornecedor_nome);
                        const draftValue = pedidoInputDrafts[p.id_produto_tiny];
                        const overrideValue = pedidoOverrides[p.id_produto_tiny];
                        const fallbackFinal = overrideValue ?? p.sugestao_ajustada;
                        const pedidoInputValue = draftValue ?? fallbackFinal.toString();

                        const live = estoqueLive[p.id_produto_tiny];
                        const saldo = live ? live.saldo : p.saldo ?? 0;
                        const reservado = live ? live.reservado : p.reservado ?? 0;
                        const disponivel = live ? live.disponivel : p.disponivel;
                        const source = live?.source;
                        const updatedAt = live?.updatedAt ?? null;
                        const loadingLive = estoqueLoading[p.id_produto_tiny];

                        // Determinar classe de urgência e zebra
                        const isUrgent = p.diasAteRuptura !== null && p.diasAteRuptura <= 3;
                        const isWarning = p.diasAteRuptura !== null && p.diasAteRuptura > 3 && p.diasAteRuptura <= 7;
                        const isEven = virtualRow.index % 2 === 0;
                        const isSelected = selectedIds[p.id_produto_tiny];
                        const rowClasses = [
                            'align-middle transition-all duration-200',
                            isSelected ? 'table-row-selected' :
                                isUrgent ? 'bg-red-50/80 dark:bg-red-950/30 hover:bg-red-100/80 dark:hover:bg-red-900/40' :
                                    isWarning ? 'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-900/30' :
                                        isEven ? 'bg-white/40 dark:bg-white/[0.02] hover:bg-white/60 dark:hover:bg-white/5' :
                                            'bg-slate-50/40 dark:bg-slate-800/20 hover:bg-slate-100/40 dark:hover:bg-slate-700/20',
                        ].join(' ');

                        return (
                            <tr key={p.id_produto_tiny} className={rowClasses}>
                                <td className={`px-3 py-2 w-[50px] align-middle text-center sticky left-0 z-10 backdrop-blur-sm ${isUrgent ? 'bg-red-50/95 dark:bg-red-950/95' :
                                    isWarning ? 'bg-amber-50/95 dark:bg-amber-950/95' :
                                        'bg-white/95 dark:bg-gray-900/95'
                                    }`}>
                                    <button
                                        type="button"
                                        role="checkbox"
                                        aria-checked={Boolean(selectedIds[p.id_produto_tiny])}
                                        className={`app-checkbox ${selectedIds[p.id_produto_tiny] ? 'checked' : ''}`}
                                        onClick={() => onToggleSelection(p.id_produto_tiny)}
                                    >
                                        <span aria-hidden className="app-checkbox-indicator" />
                                        <span className="sr-only">
                                            {selectedIds[p.id_produto_tiny] ? 'Desmarcar' : 'Selecionar'} {p.nome || 'produto'}
                                        </span>
                                    </button>
                                </td>
                                <td className={`px-3 py-2 sticky left-[50px] z-10 backdrop-blur-sm ${isUrgent ? 'bg-red-50/95 dark:bg-red-950/95' :
                                    isWarning ? 'bg-amber-50/95 dark:bg-amber-950/95' :
                                        'bg-white/95 dark:bg-gray-900/95'
                                    }`} style={{ width: '360px', minWidth: '360px', maxWidth: '360px' }}>
                                    <div className="flex items-center gap-2">
                                        <div className="relative w-10 h-10 rounded-lg bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 overflow-hidden flex-shrink-0 shadow-sm">
                                            {p.imagem_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={p.imagem_url} alt={p.nome ?? 'Produto'} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[8px] text-slate-500">Sem img</div>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-slate-900 dark:text-white select-text font-display truncate text-xs" title={p.nome || ''}>{p.nome || 'Sem nome'}</span>
                                                <span className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${p.curvaABC === 'A'
                                                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400'
                                                    : p.curvaABC === 'B'
                                                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400'
                                                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                                                    }`} title={`Curva ${p.curvaABC}`}>{p.curvaABC}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 truncate">EAN {p.gtin || '-'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300 text-xs select-all truncate sticky left-[410px] z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm" title={p.codigo ?? ''} style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>{p.codigo || '-'}</td>
                                <td className="px-3 py-2 sticky left-[520px] z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm" style={{ width: '130px', minWidth: '130px', maxWidth: '130px' }}>
                                    <div className="flex flex-col gap-0.5 w-full min-w-0">
                                        <input
                                            className="app-input h-7 text-xs px-2"
                                            value={p.fornecedor_codigo || ''}
                                            onChange={(e) => onUpdateFornecedor(p.id_produto_tiny, e.target.value)}
                                            placeholder="Cód."
                                        />
                                        <p
                                            className={`text-[9px] leading-tight truncate ${fornecedorNomeFormatado ? 'text-slate-500' : 'text-slate-400 italic'}`}
                                            title={fornecedorNomeFormatado || undefined}
                                        >
                                            {fornecedorNomeFormatado || 'N/D'}
                                        </p>
                                    </div>
                                </td>
                                <td className="px-3 py-2 text-right sticky left-[650px] z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm" style={{ width: '70px', minWidth: '70px', maxWidth: '70px' }}>
                                    <input
                                        type="number"
                                        min={1}
                                        className="app-input app-input-editable w-full h-7 text-xs px-1 text-center"
                                        value={p.embalagem_qtd}
                                        onChange={(e) => onUpdateEmbalagem(p.id_produto_tiny, Number(e.target.value))}
                                    />
                                </td>
                                <td className="px-3 py-2" style={{ width: '70px', minWidth: '70px', maxWidth: '70px' }}>
                                    <input
                                        type="number"
                                        min={0}
                                        max={365}
                                        className="app-input app-input-editable w-full h-7 text-xs px-1 text-center"
                                        value={p.lead_time_dias ?? ''}
                                        placeholder="—"
                                        onChange={(e) => onUpdateLeadTime(p.id_produto_tiny, Number(e.target.value))}
                                        title="Lead Time em dias"
                                    />
                                </td>
                                <td className="px-3 py-2 text-right" style={{ width: '100px', minWidth: '100px', maxWidth: '100px' }}>
                                    <div className="flex items-center justify-end gap-2">
                                        <div className="text-slate-900 dark:text-white font-semibold text-xs">
                                            {disponivel.toLocaleString('pt-BR')}
                                        </div>
                                        <button
                                            type="button"
                                            className="text-[9px] p-1 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-emerald-500 transition shrink-0"
                                            onClick={() => onRefreshEstoque(p.id_produto_tiny)}
                                            disabled={loadingLive}
                                            title={`Atualizar estoque ${source ? `(${source})` : ''}`}
                                        >
                                            <Loader2 className={`w-3 h-3 ${loadingLive ? 'animate-spin' : ''}`} />
                                        </button>
                                    </div>
                                </td>
                                <td className="px-3 py-2 text-right" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>
                                    {(() => {
                                        const dias = p.diasAteRuptura;
                                        if (dias === null) {
                                            return <span className="text-slate-400 text-xs">∞</span>;
                                        }
                                        const colorClass = dias <= 7
                                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'
                                            : dias <= 14
                                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400';
                                        return (
                                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}>
                                                {dias}d
                                            </span>
                                        );
                                    })()}
                                </td>
                                <td className="px-3 py-2 text-slate-900 dark:text-white text-right text-xs" style={{ width: '100px', minWidth: '100px', maxWidth: '100px' }}>{p.consumo_periodo.toLocaleString('pt-BR')}</td>
                                <td className="px-3 py-2 text-slate-900 dark:text-white text-right text-xs" style={{ width: '100px', minWidth: '100px', maxWidth: '100px' }}>{p.consumo_mensal.toFixed(0)}</td>
                                <td className="px-3 py-2 text-right" style={{ width: '100px', minWidth: '100px', maxWidth: '100px' }}>
                                    <div className="font-semibold text-slate-900 dark:text-white text-xs">{p.sugestao_base.toFixed(0)}</div>
                                    {p.alerta_embalagem && p.precisaRepor && (
                                        <div className="text-[9px] text-amber-600 leading-none mt-0.5" title="Abaixo do lote">Lote</div>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-right" style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>
                                    <div className="flex items-center justify-end gap-1">
                                        <input
                                            type="number"
                                            min={0}
                                            step={Math.max(1, p.embalagem_qtd)}
                                            className={`app-input w-full h-8 text-right font-semibold text-sm px-2 ${p.precisaRepor
                                                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/20'
                                                : 'text-slate-500 dark:text-slate-400 opacity-80'
                                                }`}
                                            value={pedidoInputValue}
                                            onChange={(event) => onPedidoChange(p.id_produto_tiny, event.target.value, p.sugestao_calculada)}
                                            onBlur={() => onPedidoBlur(p.id_produto_tiny)}
                                        />
                                        {!p.precisaRepor && p.sugestao_base > 0 && (
                                            <span className="text-xs text-amber-600 font-bold" title="Recomendação ignorada">*</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400 text-xs truncate" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                                    {p.preco_custo > 0
                                        ? p.preco_custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                        : '-'}
                                </td>
                                <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400 text-xs truncate" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                                    {p.total_valor_calculado > 0
                                        ? p.total_valor_calculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                        : '-'}
                                </td>
                                <td className="px-3 py-2" style={{ width: '220px', minWidth: '220px', maxWidth: '220px' }}>
                                    <textarea
                                        className="app-input w-full min-h-[40px] h-10 text-xs px-4 py-2 resize-y"
                                        value={p.observacao_compras ?? ''}
                                        onChange={(e) => onUpdateObservacao(p.id_produto_tiny, e.target.value)}
                                        placeholder="Obs..."
                                    />
                                </td>
                                <td className="px-3 py-2" style={{ width: '140px', minWidth: '140px', maxWidth: '140px' }}>
                                    {syncStatus[p.id_produto_tiny] === 'saving' && (
                                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                                            <Loader2 className="w-3 h-3 animate-spin" /> Salvando
                                        </span>
                                    )}
                                    {syncStatus[p.id_produto_tiny] === 'saved' && (
                                        <span className="flex items-center gap-1 text-[10px] text-emerald-600 truncate">
                                            <CheckCircle2 className="w-3 h-3" /> Salvo
                                        </span>
                                    )}
                                    {syncStatus[p.id_produto_tiny] === 'error' && (
                                        <button
                                            type="button"
                                            onClick={() => onRetrySave(p.id_produto_tiny)}
                                            className="inline-flex items-center gap-1 text-[10px] text-rose-600 truncate"
                                        >
                                            <AlertCircle className="w-3 h-3" /> Erro
                                        </button>
                                    )}
                                </td>
                            </tr>
                        );
                    })}

                    {paddingBottom > 0 && <tr><td colSpan={15} style={{ height: `${paddingBottom}px` }} /></tr>}
                </tbody>
            </table>
        </div>
    );
}
