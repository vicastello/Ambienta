'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AppDatePickerProps {
    value?: string; // YYYY-MM-DD format
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export function AppDatePicker({
    value,
    onChange,
    placeholder = 'Selecione...',
    disabled = false,
    className,
}: AppDatePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const date = value ? new Date(value + 'T00:00:00') : null;
    const [viewDate, setViewDate] = useState(date || new Date());
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
    const popupRef = useRef<HTMLDivElement>(null);

    // Calculate popup position when opening
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPopupStyle({
                position: 'fixed',
                top: rect.bottom + 8,
                left: rect.left,
                zIndex: 9999,
            });
        }
    }, [isOpen]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node;
            if (
                containerRef.current && !containerRef.current.contains(target) &&
                popupRef.current && !popupRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && date) {
            setViewDate(date);
        }
    }, [isOpen, date]);

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (year: number, month: number) => {
        return new Date(year, month, 1).getDay();
    };

    const handlePrevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    };

    const handleDateClick = (day: number) => {
        const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        const yyyy = newDate.getFullYear();
        const mm = String(newDate.getMonth() + 1).padStart(2, '0');
        const dd = String(newDate.getDate()).padStart(2, '0');
        onChange(`${yyyy}-${mm}-${dd}`);
        setIsOpen(false);
    };

    const renderCalendarDays = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        const days = [];

        // Empty cells for days before start of month
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-8 w-8" />);
        }

        // Days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month, day);
            const isSelected = date && currentDate.toDateString() === date.toDateString();
            const isToday = new Date().toDateString() === currentDate.toDateString();

            days.push(
                <button
                    key={day}
                    type="button"
                    onClick={() => handleDateClick(day)}
                    className={cn(
                        "h-8 w-8 rounded-full text-xs font-medium flex items-center justify-center transition-colors",
                        isSelected
                            ? "bg-primary-500 text-white shadow-md shadow-primary-500/30"
                            : isToday
                                ? "bg-slate-100 dark:bg-slate-700 text-primary-500 font-bold"
                                : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                >
                    {day}
                </button>
            );
        }

        return days;
    };

    const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    const formatDisplayDate = (d: Date) => {
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={cn(
                    "app-input text-left flex items-center justify-between gap-2",
                    "focus:ring-2 focus:ring-emerald-500",
                    disabled && "opacity-50 cursor-not-allowed",
                    className
                )}
            >
                <span className={date ? "text-main" : "text-muted"}>
                    {date ? formatDisplayDate(date) : placeholder}
                </span>
                <CalendarIcon className="w-4 h-4 text-muted" />
            </button>

            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={popupRef}
                    style={popupStyle}
                    className="rounded-[20px] shadow-xl p-4 w-[280px] animate-in fade-in-0 zoom-in-95 duration-200 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-white/10"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <button
                            type="button"
                            onClick={handlePrevMonth}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-600 dark:text-slate-400 transition-colors border-0 bg-transparent"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <span className="font-semibold text-sm text-slate-900 dark:text-white capitalize">
                            {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
                        </span>
                        <button
                            type="button"
                            onClick={handleNextMonth}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-600 dark:text-slate-400 transition-colors border-0 bg-transparent"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Week Days */}
                    <div className="grid grid-cols-7 mb-2 place-items-center">
                        {weekDays.map((day, i) => (
                            <div key={i} className="h-8 w-8 flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Days Grid */}
                    <div className="grid grid-cols-7 gap-y-1 place-items-center">
                        {renderCalendarDays()}
                    </div>

                    {/* Clear button */}
                    {date && (
                        <button
                            type="button"
                            onClick={() => { onChange(''); setIsOpen(false); }}
                            className="mt-3 w-full text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors border-0 bg-transparent"
                        >
                            Limpar data
                        </button>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}
