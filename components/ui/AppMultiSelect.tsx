'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X, Tag } from 'lucide-react';
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
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
                        <span className="text-slate-400 truncate">{placeholder}</span>
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
                <div className="absolute top-full mt-2 z-50 w-full min-w-[200px] rounded-2xl shadow-xl py-2 max-h-[280px] overflow-y-auto animate-in fade-in-0 zoom-in-95 duration-200 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-white/10">
                    {options.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-400 text-center">
                            Nenhuma tag disponível
                        </div>
                    ) : (
                        options.map((option) => {
                            const isSelected = values.includes(option.value);
                            const tagColor = getTagColor(option.value);

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => toggleValue(option.value)}
                                    className={cn(
                                        "w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors border-0 bg-transparent",
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
            )}
        </div>
    );
}
