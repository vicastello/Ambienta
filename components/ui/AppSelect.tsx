'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
    value: string;
    label: string;
}

interface AppSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export function AppSelect({
    value,
    onChange,
    options,
    placeholder = 'Selecione...',
    disabled = false,
    className,
}: AppSelectProps) {
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

    const selectedOption = options.find(opt => opt.value === value);

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
                <span className={selectedOption ? "text-slate-900 dark:text-white" : "text-slate-400"}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown className={cn(
                    "w-4 h-4 text-slate-400 transition-transform duration-200",
                    isOpen && "rotate-180"
                )} />
            </button>

            {isOpen && (
                <div className="absolute top-full mt-2 z-50 w-full rounded-2xl shadow-xl py-2 max-h-[240px] overflow-y-auto animate-in fade-in-0 zoom-in-95 duration-200 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-white/10">
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                            className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors border-0 bg-transparent rounded-none hover:bg-white/5"
                        >
                            {option.value === value ? (
                                <span className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium">
                                    {option.label}
                                    <Check className="w-3.5 h-3.5" />
                                </span>
                            ) : (
                                <span className="text-slate-600 dark:text-slate-300">{option.label}</span>
                            )}
                        </button>
                    ))}
                    {options.length === 0 && (
                        <div className="px-4 py-3 text-sm text-slate-400 text-center">
                            Nenhuma opção
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
