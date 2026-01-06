
import React, { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    Loader2,
    CheckCircle2,
    AlertCircle,
    ChevronsUpDown,
    ChevronUp,
    ChevronDown,
    Plus,
    Pencil,
    Trash2,
    X,
    Check,
} from 'lucide-react';
import {
    ProdutoDerivado,
    ManualItem,
    AutoSavePayload,
    EstoqueSnapshot,
    SortKey,
    SortDirection,
} from '../types';
import type { ColumnVisibility } from '../hooks/useColumnVisibility';

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
    // Callbacks para itens manuais
    onAddManualItem?: (item: Omit<ManualItem, 'id'>) => void;
    onEditManualItem?: (id: number, item: Partial<ManualItem>) => void;
    onDeleteManualItem?: (id: number) => void;
    isLoading?: boolean;
    // Column visibility
    visibleColumns?: ColumnVisibility;
};

// Skeleton Row Component
const SkeletonRow = ({ index }: { index: number }) => {
    // Alternating backgrounds for visual rhythm
    const rowClass = `app-table-row ${index % 2 === 0 ? 'dark:bg-white/[0.02]' : ''}`;

    // Sticky styles match the main table
    const stickyBase = '!bg-[var(--color-neutral-50)] dark:!bg-[var(--color-neutral-900)]';
    const stickyClass = `${stickyBase} border-b border-[var(--color-neutral-200)] dark:border-[var(--color-neutral-800)] z-10`;

    // Shimmer effect class
    const shimmer = "animate-pulse bg-slate-200 dark:bg-slate-800 rounded";

    return (
        <tr className={rowClass}>
            {/* Checkbox */}
            <td className={`px-3 py-2 w-[50px] align-middle text-center sticky left-0 ${stickyClass}`}>
                <div className={`w-4 h-4 mx-auto ${shimmer}`} />
            </td>
            {/* Produto (Image + Name) */}
            <td className={`px-3 py-2 sticky left-[50px] ${stickyClass}`} style={{ width: '320px', minWidth: '320px', maxWidth: '320px' }}>
                <div className="flex items-center gap-3">
                    <div className={`w-14 h-14 shrink-0 ${shimmer}`} />
                    <div className="flex-1 space-y-2">
                        <div className={`h-4 w-3/4 ${shimmer}`} />
                        <div className={`h-3 w-1/2 ${shimmer}`} />
                    </div>
                </div>
            </td>
            {/* SKU */}
            <td className={`px-3 py-2 sticky left-[370px] ${stickyClass}`} style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}>
                <div className={`h-4 w-16 ${shimmer}`} />
            </td>
            {/* Cód Forn */}
            <td className={`px-3 py-2 sticky left-[460px] ${stickyClass}`} style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>
                <div className={`h-4 w-20 ${shimmer}`} />
            </td>
            {/* Emb (Right aligned) */}
            <td className={`px-3 py-2 text-right sticky left-[570px] ${stickyClass}`} style={{ width: '60px', minWidth: '60px', maxWidth: '60px' }}>
                <div className={`h-6 w-full ${shimmer}`} />
            </td>

            {/* Scrolling Columns */}
            <td className="px-3 py-2" style={{ width: '70px' }}><div className={`h-6 w-full ${shimmer}`} /></td> {/* LT */}
            <td className="px-3 py-2" style={{ width: '100px' }}><div className={`h-4 w-full ${shimmer}`} /></td> {/* Estoque */}
            <td className="px-3 py-2" style={{ width: '80px' }}><div className={`h-5 w-full ${shimmer}`} /></td> {/* Ruptura */}
            <td className="px-3 py-2" style={{ width: '100px' }}><div className={`h-4 w-full ${shimmer}`} /></td> {/* Cons. Per */}
            <td className="px-3 py-2" style={{ width: '100px' }}><div className={`h-4 w-full ${shimmer}`} /></td> {/* Cons. Mês */}
            <td className="px-3 py-2" style={{ width: '100px' }}><div className={`h-4 w-full ${shimmer}`} /></td> {/* Sugestão */}
            <td className="px-3 py-2" style={{ width: '110px' }}><div className={`h-8 w-full ${shimmer}`} /></td> {/* Pedido Input */}
            <td className="px-3 py-2" style={{ width: '120px' }}><div className={`h-4 w-full ${shimmer}`} /></td> {/* Custo */}
            <td className="px-3 py-2" style={{ width: '120px' }}><div className={`h-4 w-full ${shimmer}`} /></td> {/* Total */}
            <td className="px-3 py-2" style={{ width: '220px' }}><div className={`h-8 w-full ${shimmer}`} /></td> {/* Obs */}
            <td className="px-3 py-2" style={{ width: '100px' }}><div className={`h-4 w-12 ${shimmer}`} /></td> {/* Status */}
        </tr>
    );
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
    onAddManualItem,
    onEditManualItem,
    onDeleteManualItem,
    isLoading = false,
    visibleColumns,
}: ProductTableProps) {

    const parentRef = useRef<HTMLDivElement>(null);

    // Estado para input inline de novo item manual
    const [newItemInput, setNewItemInput] = React.useState({ nome: '', fornecedor_codigo: '', quantidade: '' });
    const [editingItemId, setEditingItemId] = React.useState<number | null>(null);
    const [editingItemData, setEditingItemData] = React.useState({ nome: '', fornecedor_codigo: '', quantidade: '' });

    // Defaults quando visibleColumns não é passado (todas visíveis)
    const cols = visibleColumns ?? {
        sku: true,
        fornecedor: true,
        embalagem: true,
        leadTime: true,
        estoque: true,
        ruptura: true,
        consumoPeriodo: true,
        consumoMensal: true,
        sugestao: true,
        custo: true,
        total: true,
        observacao: true,
        status: true,
    };

    // Cálculo dinâmico das posições sticky baseado nas colunas visíveis
    const stickyPositions = useMemo(() => {
        const CHECKBOX_WIDTH = 50;
        const PRODUTO_WIDTH = 320;
        const SKU_WIDTH = 90;
        const FORNECEDOR_WIDTH = 110;
        const EMBALAGEM_WIDTH = 60;

        let offset = CHECKBOX_WIDTH; // Checkbox sempre em left: 0
        const positions = {
            produto: `${offset}px`,
            sku: '',
            fornecedor: '',
            embalagem: '',
        };

        offset += PRODUTO_WIDTH;

        if (cols.sku) {
            positions.sku = `${offset}px`;
            offset += SKU_WIDTH;
        }

        if (cols.fornecedor) {
            positions.fornecedor = `${offset}px`;
            offset += FORNECEDOR_WIDTH;
        }

        if (cols.embalagem) {
            positions.embalagem = `${offset}px`;
            offset += EMBALAGEM_WIDTH;
        }

        return positions;
    }, [cols.sku, cols.fornecedor, cols.embalagem]);

    const handleAddItem = () => {
        if (!onAddManualItem) return;
        const nome = newItemInput.nome.trim();
        const fornecedor_codigo = newItemInput.fornecedor_codigo.trim();
        const quantidade = parseInt(newItemInput.quantidade, 10);
        if (!nome || !quantidade || quantidade <= 0) return;

        onAddManualItem({
            nome,
            fornecedor_codigo,
            quantidade,
            observacao: '',
        });
        setNewItemInput({ nome: '', fornecedor_codigo: '', quantidade: '' });
    };

    const handleStartEdit = (item: ManualItem) => {
        setEditingItemId(item.id);
        setEditingItemData({
            nome: item.nome,
            fornecedor_codigo: item.fornecedor_codigo,
            quantidade: item.quantidade.toString(),
        });
    };

    const handleSaveEdit = () => {
        if (!onEditManualItem || editingItemId === null) return;
        const quantidade = parseInt(editingItemData.quantidade, 10);
        if (!editingItemData.nome.trim() || !quantidade || quantidade <= 0) return;

        onEditManualItem(editingItemId, {
            nome: editingItemData.nome.trim(),
            fornecedor_codigo: editingItemData.fornecedor_codigo.trim(),
            quantidade,
        });
        setEditingItemId(null);
    };

    const handleCancelEdit = () => {
        setEditingItemId(null);
    };

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
        estimateSize: () => 72, // More accurate height estimate
        overscan: 60, // Balanced buffer for smooth scrolling without overloading DOM
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
        // Sticky columns use fixed widths; non-sticky columns use minWidth only to allow expansion
        const style: React.CSSProperties = stickyLeft
            ? {
                width,
                minWidth: width,
                maxWidth: width,
                position: 'sticky',
                top: 0,
                left: stickyLeft,
                zIndex: 30,
            }
            : {
                minWidth: width,
                position: 'sticky',
                top: 0,
                zIndex: 20,
            };

        // Ensure solid background with !important (using !) to hide scrolling content
        const baseBg = '!bg-[var(--color-neutral-50)] dark:!bg-[var(--color-neutral-900)]';
        const stickyBg = stickyLeft ? '!bg-[var(--color-neutral-50)] dark:!bg-[var(--color-neutral-900)] shadow-[1px_0_0_0_rgba(0,0,0,0.05)]' : baseBg;
        const stickyClass = `${stickyBg} border-b border-[var(--color-neutral-200)] dark:border-[var(--color-neutral-800)]`;

        return (
            <th className={`px-3 py-2 text-${align} ${stickyClass} align-bottom`} style={style} aria-sort={getAriaSort(key)}>
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onToggleSort(key)}
                    className={`sortable-header ${align === 'right' ? 'justify-end text-right' : 'text-left'}`}
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
        <div ref={parentRef} className="table-container h-full rounded-3xl">
            <table className="table-base">
                <thead className="app-table-header z-50">
                    <tr>
                        <th className="px-3 py-2 text-left w-[50px] sticky top-0 left-0 z-30 !bg-[var(--color-neutral-50)] dark:!bg-[var(--color-neutral-900)] align-middle border-b border-[var(--color-neutral-200)] dark:border-[var(--color-neutral-800)]">
                            <span className="sr-only">Selecionar</span>
                        </th>
                        {/* Frozen Columns - Produto sempre visível */}
                        {renderSortableHeader('Produto', 'nome', '320px', 'left', stickyPositions.produto)}
                        {cols.sku && renderSortableHeader('SKU', 'codigo', '90px', 'left', stickyPositions.sku)}
                        {cols.fornecedor && renderSortableHeader('Cód. Forn.', 'fornecedor_codigo', '110px', 'left', stickyPositions.fornecedor)}
                        {cols.embalagem && renderSortableHeader('Emb.', 'embalagem_qtd', '60px', 'right', stickyPositions.embalagem)}

                        {/* Scrolling Columns */}
                        {cols.leadTime && <th className="px-3 py-2 text-right min-w-[70px] align-middle sticky top-0 z-20 !bg-[var(--color-neutral-50)] dark:!bg-[var(--color-neutral-900)] border-b border-[var(--color-neutral-200)] dark:border-[var(--color-neutral-800)]" title="Lead Time (dias de entrega do fornecedor)">LT</th>}
                        {cols.estoque && renderSortableHeader('Estoque', 'disponivel', '85px', 'right')}
                        {cols.ruptura && renderSortableHeader('Rupt.', 'diasAteRuptura', '70px', 'right')}
                        {cols.consumoPeriodo && renderSortableHeader('Cons. Per.', 'consumo_periodo', '85px', 'right')}
                        {cols.consumoMensal && renderSortableHeader('Cons. Mês', 'consumo_mensal', '85px', 'right')}
                        {cols.sugestao && renderSortableHeader('Sugestão', 'sugestao_base', '85px', 'right')}
                        {/* Pedido sempre visível */}
                        {renderSortableHeader('Pedido', 'sugestao_ajustada', '90px', 'right')}
                        {cols.custo && <th className="px-3 py-2 text-right sticky top-0 z-20 min-w-[90px] align-middle !bg-[var(--color-neutral-50)] dark:!bg-[var(--color-neutral-900)] border-b border-[var(--color-neutral-200)] dark:border-[var(--color-neutral-800)]">Custo</th>}
                        {cols.total && <th className="px-3 py-2 text-right sticky top-0 z-20 min-w-[90px] align-middle !bg-[var(--color-neutral-50)] dark:!bg-[var(--color-neutral-900)] border-b border-[var(--color-neutral-200)] dark:border-[var(--color-neutral-800)]">Total</th>}
                        {cols.observacao && <th className="px-3 py-2 text-left sticky top-0 z-20 min-w-[150px] align-middle !bg-[var(--color-neutral-50)] dark:!bg-[var(--color-neutral-900)] border-b border-[var(--color-neutral-200)] dark:border-[var(--color-neutral-800)]">Obs. (PDF)</th>}
                        {cols.status && <th className="px-3 py-2 text-left sticky top-0 z-20 min-w-[80px] align-middle !bg-[var(--color-neutral-50)] dark:!bg-[var(--color-neutral-900)] border-b border-[var(--color-neutral-200)] dark:border-[var(--color-neutral-800)]">Status</th>}
                    </tr>
                </thead>
                <tbody className="tbody-divider">
                    {isLoading ? (
                        // Render fixed number of skeleton rows
                        Array.from({ length: 15 }).map((_, idx) => (
                            <SkeletonRow key={`skeleton-${idx}`} index={idx} />
                        ))
                    ) : (
                        <>
                            {paddingTop > 0 && <tr><td colSpan={16} style={{ height: `${paddingTop}px` }} /></tr>}

                            {virtualItems.map((virtualRow) => {
                                const item = allItems[virtualRow.index];

                                if (item.type === 'manual') {
                                    const m = item.data;
                                    const isEditing = editingItemId === m.id;
                                    const isSelected = selectedIds[m.id];

                                    // Manual items don't have complex warning logic yet, but valid to have selection style
                                    // Sticky cells sempre neutros
                                    const stickyDataClass = '!bg-[var(--color-neutral-50)] dark:!bg-[var(--color-neutral-900)]';

                                    return (
                                        <tr key={`manual-item-${m.id}`} className="align-middle manual-row">
                                            <td className={`px-3 py-2 w-[50px] align-middle text-center sticky left-0 z-10 sticky-cell ${stickyDataClass}`}>
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
                                            <td className={`px-3 py-2 sticky left-[50px] z-10 sticky-cell dark:bg-[var(--color-neutral-900)]/95 backdrop-blur-sm ${stickyDataClass}`} style={{ width: '320px', minWidth: '320px', maxWidth: '320px' }}>
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={editingItemData.nome}
                                                        onChange={(e) => setEditingItemData(prev => ({ ...prev, nome: e.target.value }))}
                                                        className="w-full px-2 py-1 text-sm rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-neutral-800"
                                                        placeholder="Nome do produto"
                                                    />
                                                ) : (
                                                    <div>
                                                        <div className="font-semibold text-[var(--color-neutral-900)] dark:text-white truncate">{m.nome}</div>
                                                        <p className="text-[11px] text-amber-600 dark:text-amber-400">Item manual</p>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center text-[var(--color-neutral-500)] dark:text-[var(--color-neutral-400)] sticky left-[370px] z-10 sticky-cell dark:bg-[var(--color-neutral-900)]/95" style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}>—</td>
                                            <td className="px-3 py-2 sticky left-[460px] z-10 sticky-cell dark:bg-[var(--color-neutral-900)]/95" style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={editingItemData.fornecedor_codigo}
                                                        onChange={(e) => setEditingItemData(prev => ({ ...prev, fornecedor_codigo: e.target.value }))}
                                                        className="w-full px-2 py-1 text-sm rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-neutral-800"
                                                        placeholder="Cód. Forn."
                                                    />
                                                ) : (
                                                    <div className="text-sm font-medium text-[var(--color-neutral-700)] dark:text-[var(--color-neutral-200)] truncate" title={m.fornecedor_codigo}>{m.fornecedor_codigo || '—'}</div>
                                                )}
                                            </td>
                                            <td colSpan={7} className="text-center text-[var(--color-neutral-300)] dark:text-[var(--color-neutral-600)]">—</td>
                                            <td className="px-3 py-2 font-semibold text-[var(--color-success)] dark:text-[var(--color-success-light)] text-right sticky left-[570px] z-10 sticky-cell dark:bg-[var(--color-neutral-900)]/95" style={{ width: '60px', minWidth: '60px', maxWidth: '60px' }}>
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        value={editingItemData.quantidade}
                                                        onChange={(e) => setEditingItemData(prev => ({ ...prev, quantidade: e.target.value }))}
                                                        className="w-16 px-2 py-1 text-sm text-right rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-neutral-800"
                                                        min="1"
                                                    />
                                                ) : (
                                                    m.quantidade
                                                )}
                                            </td>
                                            <td colSpan={2} className="text-center text-[var(--color-neutral-300)] dark:text-[var(--color-neutral-600)] sticky min-w-[120px]">—</td>
                                            <td className="px-3 py-2 min-w-[120px]">
                                                <span className="text-sm text-[var(--color-neutral-600)] dark:text-[var(--color-neutral-300)] truncate block" title={m.observacao}>{m.observacao}</span>
                                            </td>
                                            <td className="px-3 py-2 min-w-[100px]">
                                                <div className="flex items-center gap-1">
                                                    {isEditing ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={handleSaveEdit}
                                                                className="p-1.5 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 transition-colors"
                                                                title="Salvar"
                                                            >
                                                                <Check className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={handleCancelEdit}
                                                                className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors"
                                                                title="Cancelar"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            {onEditManualItem && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleStartEdit(m)}
                                                                    className="p-1.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
                                                                    title="Editar"
                                                                >
                                                                    <Pencil className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                            {onDeleteManualItem && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onDeleteManualItem(m.id)}
                                                                    className="p-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                                                                    title="Remover"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </td>
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

                                // Restaurando flags para lógica interna (se necessário em outros lugares)
                                const isUrgent = p.diasAteRuptura !== null && p.diasAteRuptura <= 3;
                                const isWarning = p.curvaABC === 'A' && p.diasAteRuptura !== null && p.diasAteRuptura <= 7;

                                // Definir estilo da linha baseado em alertas
                                const isSelected = selectedIds[p.id_produto_tiny];
                                let rowClass = `app-table-row transition-all duration-200`;

                                // Flags de alerta
                                const isCritical = isWarning || isUrgent;
                                const isAlertEmbalagem = !!p.alerta_embalagem;

                                // Background para células sticky (sempre opaco neutro para scroll)
                                let stickyDataClass = '!bg-[var(--color-neutral-50)] dark:!bg-[var(--color-neutral-900)]';

                                // Borda colorida no início da linha para indicar alerta
                                let alertBorderClass = '';

                                if (isCritical) {
                                    // CRÍTICO: Borda rosa/vermelha
                                    alertBorderClass = 'alert-border-critical';
                                } else if (isAlertEmbalagem) {
                                    // EMBALAGEM: Borda âmbar
                                    alertBorderClass = 'alert-border-warning';
                                }

                                // Zebra striping apenas (sem cor para selecionados)
                                if (virtualRow.index % 2 === 0) {
                                    rowClass += ' dark:bg-white/[0.02]';
                                }

                                return (
                                    <tr key={p.id_produto_tiny} className={rowClass}>
                                        <td className={`px-3 py-2 w-[50px] align-middle text-center sticky left-0 z-10 sticky-cell ${stickyDataClass} ${alertBorderClass}`}>
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
                                        <td className={`px-3 py-2 sticky left-[50px] z-10 ${stickyDataClass}`} style={{ width: '320px', minWidth: '320px', maxWidth: '320px' }}>
                                            <div className="flex items-center gap-3">
                                                <div className="relative w-14 h-14 rounded-lg bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 overflow-hidden flex-shrink-0 shadow-sm">
                                                    {p.imagem_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={p.imagem_url} alt={p.nome ?? 'Produto'} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-[8px] text-[var(--color-neutral-500)]">Sem img</div>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="cell-text-name truncate max-w-[180px]" title={p.nome || ''}>{p.nome || 'Sem nome'}</span>
                                                        <span className={`abc-badge-inline ${p.curvaABC === 'A'
                                                            ? 'abc-badge-a-inline'
                                                            : p.curvaABC === 'B'
                                                                ? 'abc-badge-b-inline'
                                                                : 'abc-badge-c-inline'
                                                            }`} title={`Curva ${p.curvaABC}`}>{p.curvaABC}</span>
                                                    </div>
                                                    <p className="text-[10px] text-[var(--color-neutral-500)] truncate">EAN {p.gtin || '-'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        {cols.sku && <td className={`px-3 py-2 cell-text-code select-all truncate sticky z-10 ${stickyDataClass}`} title={p.codigo ?? ''} style={{ width: '90px', minWidth: '90px', maxWidth: '90px', left: stickyPositions.sku }}>{p.codigo || '-'}</td>}
                                        {cols.fornecedor && <td className={`px-3 py-2 sticky z-10 ${stickyDataClass}`} style={{ width: '110px', minWidth: '110px', maxWidth: '110px', left: stickyPositions.fornecedor }}>
                                            <div className="flex flex-col gap-0.5 w-full min-w-0">
                                                <input
                                                    className="app-input h-8 text-sm px-2"
                                                    value={p.fornecedor_codigo || ''}
                                                    onChange={(e) => onUpdateFornecedor(p.id_produto_tiny, e.target.value)}
                                                    placeholder="Cód."
                                                />
                                                <p
                                                    className={`text-[9px] leading-tight truncate ${fornecedorNomeFormatado ? 'text-[var(--color-neutral-500)]' : 'text-[var(--color-neutral-400)] italic'}`}
                                                    title={fornecedorNomeFormatado || undefined}
                                                >
                                                    {fornecedorNomeFormatado || 'N/D'}
                                                </p>
                                            </div>
                                        </td>}
                                        {cols.embalagem && <td className={`px-3 py-2 text-right sticky z-10 ${stickyDataClass}`} style={{ width: '60px', minWidth: '60px', maxWidth: '60px', left: stickyPositions.embalagem }}>
                                            <input
                                                type="number"
                                                min={1}
                                                className="app-input app-input-editable w-full h-8 text-sm px-1 text-center"
                                                value={p.embalagem_qtd}
                                                onChange={(e) => onUpdateEmbalagem(p.id_produto_tiny, Number(e.target.value))}
                                            />
                                        </td>}
                                        {cols.leadTime && <td className="px-3 py-2" style={{ minWidth: '70px' }}>
                                            <input
                                                type="number"
                                                min={0}
                                                max={365}
                                                className={`app-input app-input-editable w-full h-8 text-sm px-1 text-center ${p.isDefaultLeadTime ? 'text-[var(--color-neutral-400)] italic' : ''}`}
                                                value={p.lead_time_dias ?? ''}
                                                placeholder="—"
                                                onChange={(e) => onUpdateLeadTime(p.id_produto_tiny, Number(e.target.value))}
                                                title="Lead Time em dias"
                                            />
                                        </td>}
                                        {cols.estoque && <td className="px-3 py-2 text-right" style={{ minWidth: '85px' }}>
                                            <div className="flex items-center justify-end gap-2">
                                                <div className="text-[var(--color-neutral-900)] dark:text-white font-semibold text-xs">
                                                    {disponivel.toLocaleString('pt-BR')}
                                                </div>
                                                <button
                                                    type="button"
                                                    className="text-[9px] p-1 rounded-full hover:bg-[var(--color-neutral-100)] dark:hover:bg-white/10 text-[var(--color-neutral-400)] hover:text-table-success transition shrink-0"
                                                    onClick={() => onRefreshEstoque(p.id_produto_tiny)}
                                                    disabled={loadingLive}
                                                    title={`Atualizar estoque ${source ? `(${source})` : ''}`}
                                                >
                                                    <Loader2 className={`w-3 h-3 ${loadingLive ? 'animate-spin' : ''}`} />
                                                </button>
                                            </div>
                                        </td>}
                                        {cols.ruptura && <td className="px-3 py-2 text-right" style={{ minWidth: '70px' }}>
                                            {(() => {
                                                const dias = p.diasAteRuptura;
                                                if (dias === null) {
                                                    return <span className="text-table-muted text-table-xs">∞</span>;
                                                }
                                                const colorClass = dias <= 7
                                                    ? 'dias-badge-critical'
                                                    : dias <= 14
                                                        ? 'dias-badge-warning'
                                                        : 'dias-badge-healthy';
                                                return (
                                                    <span className={`dias-badge ${colorClass}`}>
                                                        {dias}d
                                                    </span>
                                                );
                                            })()}
                                        </td>}
                                        {cols.consumoPeriodo && <td className="px-3 py-2 text-[var(--color-neutral-900)] dark:text-white text-right text-xs" style={{ minWidth: '85px' }}>{p.consumo_periodo.toLocaleString('pt-BR')}</td>}
                                        {cols.consumoMensal && <td className="px-3 py-2 text-[var(--color-neutral-900)] dark:text-white text-right text-xs" style={{ minWidth: '85px' }}>{p.consumo_mensal.toFixed(0)}</td>}
                                        {cols.sugestao && <td className="px-3 py-2 text-right" style={{ minWidth: '85px' }}>
                                            <div className="font-semibold text-[var(--color-neutral-900)] dark:text-white text-xs">{p.sugestao_base.toFixed(0)}</div>
                                            {Math.ceil(p.quantidadeNecessaria) > 0 && Math.ceil(p.quantidadeNecessaria) !== p.sugestao_base && (
                                                <div className="text-[9px] text-[var(--color-neutral-500)] leading-none mt-0.5" title="Quantidade real necessária sem arredondamento de embalagem">
                                                    (real: {Math.ceil(p.quantidadeNecessaria)})
                                                </div>
                                            )}
                                            {p.alerta_embalagem && p.precisaRepor && (
                                                <div className="text-[9px] text-table-warning leading-none mt-0.5" title="Abaixo do lote">Lote</div>
                                            )}
                                        </td>}
                                        <td className="px-3 py-2 text-right" style={{ minWidth: '90px' }}>
                                            <div className="flex items-center justify-end gap-1 relative">
                                                {p.estoquePendente > 0 && (
                                                    <div
                                                        className="w-2 h-2 rounded-full bg-amber-400 absolute -left-3 top-1/2 -translate-y-1/2 animate-pulse"
                                                        title={`Aguardando recebimento de ${p.estoquePendente} unidades`}
                                                    />
                                                )}
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={Math.max(1, p.embalagem_qtd)}
                                                    className={`app-input w-full h-9 text-right font-semibold text-sm px-2 ${p.precisaRepor
                                                        ? 'text-[var(--color-success)] dark:text-[var(--color-success-light)] bg-[var(--color-success-soft)] '
                                                        : 'text-[var(--color-neutral-500)] dark:text-[var(--color-neutral-400)] opacity-80'
                                                        }`}
                                                    value={pedidoInputValue}
                                                    onChange={(event) => onPedidoChange(p.id_produto_tiny, event.target.value, p.sugestao_calculada)}
                                                    onBlur={() => onPedidoBlur(p.id_produto_tiny)}
                                                />
                                                {!p.precisaRepor && p.sugestao_base > 0 && (
                                                    <span className="text-xs text-table-warning font-bold" title="Recomendação ignorada">*</span>
                                                )}
                                            </div>
                                        </td>
                                        {cols.custo && <td className="px-3 py-2 text-right font-medium cell-text-price truncate" style={{ minWidth: '90px' }}>
                                            {p.preco_custo > 0
                                                ? p.preco_custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                                : '-'}
                                        </td>}
                                        {cols.total && <td className="px-3 py-2 text-right font-bold cell-text-price text-[var(--color-success)] dark:text-[var(--color-success-light)] truncate" style={{ minWidth: '90px' }}>
                                            {p.total_valor_calculado > 0
                                                ? p.total_valor_calculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                                : '-'}
                                        </td>}
                                        {cols.observacao && <td className="px-3 py-2" style={{ minWidth: '150px' }}>
                                            <textarea
                                                className="app-input w-full min-h-[40px] h-10 text-sm px-4 py-2 resize-y"
                                                value={p.observacao_compras ?? ''}
                                                onChange={(e) => onUpdateObservacao(p.id_produto_tiny, e.target.value)}
                                                placeholder="Obs..."
                                            />
                                        </td>}
                                        {cols.status && <td className="px-3 py-2 text-left" style={{ minWidth: '80px' }}>
                                            {syncStatus[p.id_produto_tiny] === 'saving' && (
                                                <span className="sync-indicator sync-indicator-saving">
                                                    <Loader2 className="w-3 h-3 animate-spin" /> Salvando
                                                </span>
                                            )}
                                            {syncStatus[p.id_produto_tiny] === 'saved' && (
                                                <span className="sync-indicator sync-indicator-saved">
                                                    <CheckCircle2 className="w-3 h-3" /> Salvo
                                                </span>
                                            )}
                                            {syncStatus[p.id_produto_tiny] === 'error' && (
                                                <button
                                                    type="button"
                                                    onClick={() => onRetrySave(p.id_produto_tiny)}
                                                    className="sync-indicator sync-indicator-error"
                                                >
                                                    <AlertCircle className="w-3 h-3" /> Erro
                                                </button>
                                            )}
                                        </td>}
                                    </tr>
                                );
                            })}

                            {paddingBottom > 0 && <tr><td colSpan={15} style={{ height: `${paddingBottom}px` }} /></tr>}
                        </>
                    )}
                </tbody>
            </table>
        </div>
    );
}
