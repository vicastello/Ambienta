'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Columns3, RotateCcw, Eye, EyeOff } from 'lucide-react';
import {
    ColumnKey,
    ColumnVisibility,
    COLUMN_LABELS,
    ALL_COLUMN_KEYS,
} from '../hooks/useColumnVisibility';

type ColumnVisibilityDropdownProps = {
    visibility: ColumnVisibility;
    onToggle: (key: ColumnKey) => void;
    onShowAll: () => void;
    onHideAll: () => void;
    onRestoreDefaults: () => void;
    visibleCount: number;
    totalCount: number;
};

export function ColumnVisibilityDropdown({
    visibility,
    onToggle,
    onShowAll,
    onHideAll,
    onRestoreDefaults,
    visibleCount,
    totalCount,
}: ColumnVisibilityDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Posicionar dropdown abaixo do botão
    useEffect(() => {
        if (!isOpen || !buttonRef.current) return;

        const rect = buttonRef.current.getBoundingClientRect();
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
        const dropdownWidth = 280;
        const horizontalPadding = 12;

        // Garantir que não ultrapasse a viewport à direita
        const left = Math.min(
            rect.left,
            viewportWidth - dropdownWidth - horizontalPadding
        );

        setPosition({
            top: rect.bottom + 8,
            left: Math.max(horizontalPadding, left),
        });
    }, [isOpen]);

    // Fechar ao clicar fora
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                buttonRef.current &&
                !buttonRef.current.contains(event.target as Node) &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const hiddenCount = totalCount - visibleCount;

    return (
        <>
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                className="glass-btn glass-btn-ghost flex items-center gap-2 h-10 px-3 rounded-xl text-sm"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label="Configurar colunas visíveis"
                title="Configurar colunas visíveis"
            >
                <Columns3 className="w-4 h-4" />
                <span className="hidden sm:inline">Colunas</span>
                {hiddenCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                        -{hiddenCount}
                    </span>
                )}
            </button>

            {isOpen &&
                typeof document !== 'undefined' &&
                ReactDOM.createPortal(
                    <div
                        ref={dropdownRef}
                        className="fixed z-[9999] glass-panel rounded-2xl overflow-hidden shadow-xl"
                        style={{
                            top: `${position.top}px`,
                            left: `${position.left}px`,
                            width: 280,
                        }}
                    >
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-white/10 dark:border-slate-700/30">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-[var(--text-main)]">
                                    Colunas Visíveis
                                </span>
                                <span className="text-xs text-[var(--text-muted)]">
                                    {visibleCount}/{totalCount}
                                </span>
                            </div>
                        </div>

                        {/* Lista de colunas */}
                        <div className="max-h-72 overflow-y-auto">
                            {ALL_COLUMN_KEYS.map((key) => (
                                <label
                                    key={key}
                                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors border-b border-white/5 dark:border-slate-700/10 last:border-b-0"
                                >
                                    <input
                                        type="checkbox"
                                        checked={visibility[key]}
                                        onChange={() => onToggle(key)}
                                        className="w-4 h-4 rounded accent-teal-500 cursor-pointer"
                                    />
                                    <span className="text-sm text-[var(--text-main)] flex-1">
                                        {COLUMN_LABELS[key]}
                                    </span>
                                    {!visibility[key] && (
                                        <EyeOff className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-50" />
                                    )}
                                </label>
                            ))}
                        </div>

                        {/* Footer com ações */}
                        <div className="border-t border-white/10 dark:border-slate-700/30 px-3 py-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        onShowAll();
                                    }}
                                    className="glass-btn glass-btn-ghost text-xs px-2.5 py-1.5 rounded-lg h-auto flex items-center gap-1"
                                    title="Mostrar todas"
                                >
                                    <Eye className="w-3 h-3" />
                                    Todas
                                </button>
                                <button
                                    onClick={() => {
                                        onHideAll();
                                    }}
                                    className="glass-btn glass-btn-ghost text-xs px-2.5 py-1.5 rounded-lg h-auto flex items-center gap-1"
                                    title="Ocultar todas"
                                >
                                    <EyeOff className="w-3 h-3" />
                                    Nenhuma
                                </button>
                            </div>
                            <button
                                onClick={() => {
                                    onRestoreDefaults();
                                }}
                                className="glass-btn glass-btn-ghost text-xs px-2.5 py-1.5 rounded-lg h-auto flex items-center gap-1 text-amber-600 dark:text-amber-400"
                                title="Restaurar padrão"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Padrão
                            </button>
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
