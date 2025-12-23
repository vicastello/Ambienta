'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X, Tag, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTagColor } from '@/lib/tagColors';

export interface MultiSelectOption {
    value: string;
    label: string;
}

interface AppMultiSelectProps {
    values: string[];
    onChange: (values: string[]) => void;
    options: MultiSelectOption[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    icon?: React.ReactNode;
}

export function AppMultiSelect({
    values,
    onChange,
    options,
    placeholder = 'Selecione...',
    disabled = false,
    className,
    icon,
}: AppMultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus input when dropdown opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const toggleValue = (value: string) => {
        if (values.includes(value)) {
            onChange(values.filter(v => v !== value));
        } else {
            onChange([...values, value]);
        }
    };

    const clearAll = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange([]);
    };

    const selectedLabels = values
        .map(v => options.find(opt => opt.value === v)?.label)
        .filter(Boolean);

    // Filter options based on search term
    const filteredOptions = options.filter(option =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={cn(
                    "app-input w-full text-left flex items-center justify-between gap-2",
                    disabled && "opacity-50 cursor-not-allowed",
                    className
                )}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {icon && <span className="text-slate-400 flex-shrink-0">{icon}</span>}
                    {values.length === 0 ? (
                        <span className="text-slate-900 dark:text-white truncate">{placeholder}</span>
                    ) : values.length === 1 ? (
                        <span className="text-slate-900 dark:text-white truncate">
                            {selectedLabels[0]}
                        </span>
                    ) : (
                        <span className="text-slate-900 dark:text-white truncate">
                            {values.length} selecionadas
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {values.length > 0 && (
                        <button
                            type="button"
                            onClick={clearAll}
                            className="p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                            <X className="w-3 h-3 text-slate-400" />
                        </button>
                    )}
                    <ChevronDown className={cn(
                        "w-4 h-4 text-slate-400 transition-transform duration-200",
                        isOpen && "rotate-180"
                    )} />
                </div>
            </button>

            {isOpen && (
                <div className="absolute top-full mt-2 z-50 w-full min-w-[220px] rounded-2xl shadow-xl max-h-[320px] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-white/10">
                    {/* Search Input */}
                    <div className="p-2 border-b border-slate-200/50 dark:border-white/10">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Buscar tag..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100 dark:bg-white/5 rounded-xl border-0 outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-slate-400"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"
                                >
                                    <X className="w-3 h-3 text-slate-400" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Options List */}
                    <div className="py-2 max-h-[240px] overflow-y-auto">
                        {filteredOptions.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-slate-400 text-center">
                                {options.length === 0 ? 'Nenhuma tag disponível' : 'Nenhuma tag encontrada'}
                            </div>
                        ) : (
                            filteredOptions.map((option) => {
                                const isSelected = values.includes(option.value);
                                const tagColor = getTagColor(option.value);

                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => toggleValue(option.value)}
                                        className={cn(
                                            "w-full px-3 py-2 text-left text-sm flex items-center justify-start gap-2 transition-colors border-0 bg-transparent",
                                            isSelected
                                                ? "bg-primary-50 dark:bg-primary-900/20"
                                                : "hover:bg-slate-50 dark:hover:bg-white/5"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                                            isSelected
                                                ? "bg-primary-500 border-primary-500"
                                                : "border-slate-300 dark:border-slate-600"
                                        )}>
                                            {isSelected && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        <span className={cn(
                                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                                            tagColor.bg,
                                            tagColor.text,
                                            tagColor.border,
                                            "border"
                                        )}>
                                            <Tag className="w-3 h-3" />
                                            {option.label}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
