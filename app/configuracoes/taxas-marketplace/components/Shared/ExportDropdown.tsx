'use client';

/**
 * Dropdown unificado para exportação de configurações
 */

import { useState, useRef, useEffect } from 'react';
import { Download, Upload, Undo, ChevronDown, FileText, FileSpreadsheet, File } from 'lucide-react';

interface ExportDropdownProps {
    /** Callback para exportar em formato específico */
    onExport: (format: 'json' | 'csv' | 'pdf') => void;
    /** Callback para abrir modal de importação */
    onImport: () => void;
    /** Callback para desfazer */
    onUndo?: () => void;
    /** Se pode desfazer */
    canUndo?: boolean;
    /** Classes CSS adicionais */
    className?: string;
}

export function ExportDropdown({
    onExport,
    onImport,
    onUndo,
    canUndo = false,
    className = '',
}: ExportDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Fecha dropdown ao clicar fora
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fecha dropdown ao pressionar ESC
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen]);

    const handleExport = (format: 'json' | 'csv' | 'pdf') => {
        onExport(format);
        setIsOpen(false);
    };

    return (
        <div className={`flex items-center gap-2 ${className}`} role="toolbar" aria-label="Ferramentas de exportação">
            {/* Dropdown de Export */}
            <div className="relative" ref={dropdownRef}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="
                        px-4 py-2 text-sm rounded-lg 
                        bg-slate-200 dark:bg-slate-800 
                        hover:bg-slate-300 dark:hover:bg-slate-700 
                        text-slate-700 dark:text-slate-300 
                        transition-all 
                        inline-flex items-center gap-2
                        focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:outline-none
                    "
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                >
                    <Download className="w-4 h-4" />
                    Exportar
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                    <div
                        className="
                            absolute top-full left-0 mt-1 z-50
                            min-w-[160px] py-1
                            bg-white dark:bg-slate-800 
                            rounded-lg shadow-xl 
                            border border-slate-200 dark:border-slate-700
                            animate-in fade-in slide-in-from-top-2 duration-200
                        "
                        role="menu"
                    >
                        <button
                            onClick={() => handleExport('json')}
                            className="
                                w-full px-4 py-2 text-sm text-left
                                text-slate-700 dark:text-slate-300
                                hover:bg-slate-100 dark:hover:bg-slate-700
                                inline-flex items-center gap-3
                                transition-colors
                            "
                            role="menuitem"
                        >
                            <File className="w-4 h-4 text-blue-500" />
                            JSON
                        </button>
                        <button
                            onClick={() => handleExport('csv')}
                            className="
                                w-full px-4 py-2 text-sm text-left
                                text-slate-700 dark:text-slate-300
                                hover:bg-slate-100 dark:hover:bg-slate-700
                                inline-flex items-center gap-3
                                transition-colors
                            "
                            role="menuitem"
                        >
                            <FileSpreadsheet className="w-4 h-4 text-green-500" />
                            CSV
                        </button>
                        <button
                            onClick={() => handleExport('pdf')}
                            className="
                                w-full px-4 py-2 text-sm text-left
                                text-slate-700 dark:text-slate-300
                                hover:bg-slate-100 dark:hover:bg-slate-700
                                inline-flex items-center gap-3
                                transition-colors
                            "
                            role="menuitem"
                        >
                            <FileText className="w-4 h-4 text-red-500" />
                            PDF
                        </button>
                    </div>
                )}
            </div>

            {/* Botão de Import */}
            <button
                onClick={onImport}
                className="
                    px-4 py-2 text-sm rounded-lg 
                    bg-purple-600 hover:bg-purple-700 
                    text-white 
                    transition-all 
                    inline-flex items-center gap-2
                    focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:outline-none
                "
                aria-label="Importar configurações de arquivo"
            >
                <Upload className="w-4 h-4" />
                Importar
            </button>

            {/* Botão de Undo (condicional) */}
            {canUndo && onUndo && (
                <button
                    onClick={onUndo}
                    className="
                        px-4 py-2 text-sm rounded-lg 
                        bg-orange-600 hover:bg-orange-700 
                        text-white 
                        transition-all 
                        inline-flex items-center gap-2
                        focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:outline-none
                    "
                    aria-label="Desfazer última alteração"
                >
                    <Undo className="w-4 h-4" />
                    Desfazer
                </button>
            )}
        </div>
    );
}
