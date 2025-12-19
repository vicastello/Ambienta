'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PeriodPickerProps {
    startDate?: string;
    endDate?: string;
    currentPreset: string;
    onPresetSelect: (preset: string) => void;
    onRangeChange: (start: string | undefined, end: string | undefined) => void;
}

const PRESETS = [
    { value: 'hoje', label: 'Hoje' },
    { value: 'ontem', label: 'Ontem' },
    { value: '7dias', label: '7 dias' },
    { value: 'mes_atual', label: 'Mês Atual' },
    { value: '30dias', label: '30 dias' },
    { value: 'mes_passado', label: 'Mês Passado' },
];

export function PeriodPicker({
    startDate,
    endDate,
    currentPreset,
    onPresetSelect,
    onRangeChange
}: PeriodPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Calendar state
    const [viewDate, setViewDate] = useState(new Date());

    useEffect(() => {
        if (startDate) {
            const [y, m, d] = startDate.split('-').map(Number);
            setViewDate(new Date(y, m - 1, d));
        }
    }, [startDate, isOpen]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handlePrevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    };

    const handleDateClick = (dateStr: string) => {
        if ((startDate && endDate) || (!startDate && !endDate)) {
            onRangeChange(dateStr, undefined);
        } else if (startDate && !endDate) {
            if (dateStr < startDate) {
                onRangeChange(dateStr, startDate);
            } else {
                onRangeChange(startDate, dateStr);
            }
        }
    };

    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const renderCalendarDays = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        const days = [];

        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-8 w-8" />);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateStr = date.toISOString().split('T')[0];

            const isStart = startDate === dateStr;
            const isEnd = endDate === dateStr;
            const isInRange = startDate && endDate && dateStr > startDate && dateStr < endDate;
            const isToday = new Date().toISOString().split('T')[0] === dateStr;

            days.push(
                <button
                    key={day}
                    type="button"
                    onClick={() => handleDateClick(dateStr)}
                    className={cn(
                        "h-8 w-8 text-xs font-medium flex items-center justify-center transition-all relative z-10",
                        // Shape: Circular for start/end, square for range
                        (isStart || isEnd) ? "rounded-full" : "rounded-none",

                        // Colors
                        (isStart || isEnd)
                            ? "bg-primary-500 text-white shadow-md shadow-primary-500/30"
                            : isInRange
                                ? "bg-primary-100 dark:bg-primary-900/40 text-primary-900 dark:text-primary-100"
                                : isToday
                                    ? "bg-slate-100 dark:bg-slate-700 text-primary-500 font-bold rounded-full"
                                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:rounded-full bg-transparent border-0"
                    )}
                >
                    <span className="relative z-20">{day}</span>

                    {/* Background connector for range (stronger visibility) */}
                    {isInRange && <div className="absolute inset-0 bg-primary-100 dark:bg-primary-900/40 -z-10" />}

                    {/* Connectors for start/end points */}
                    {(isStart && endDate && endDate > startDate) && (
                        <div className="absolute top-0 bottom-0 right-0 w-1/2 bg-primary-100 dark:bg-primary-900/40 -z-10 pointer-events-none" />
                    )}
                    {(isEnd && startDate && startDate < endDate) && (
                        <div className="absolute top-0 bottom-0 left-0 w-1/2 bg-primary-100 dark:bg-primary-900/40 -z-10 pointer-events-none" />
                    )}
                </button>
            );
        }
        return days;
    };

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    let displayLabel = 'Selecione...';
    if (currentPreset !== 'custom') {
        displayLabel = PRESETS.find(p => p.value === currentPreset)?.label || currentPreset;
    } else if (startDate && endDate) {
        const d1 = new Date(startDate + 'T12:00:00');
        const d2 = new Date(endDate + 'T12:00:00');
        displayLabel = `${d1.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${d2.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
    }

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="app-input w-full text-left flex items-center justify-between gap-2 min-w-[200px]"
            >
                <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <CalendarIcon className="w-4 h-4 text-slate-400" />
                    <span>{displayLabel}</span>
                </div>
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 z-[100] rounded-[20px] shadow-xl p-4 w-[320px] animate-in fade-in-0 zoom-in-95 duration-200 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-white/10">
                    {/* Presets */}
                    <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-slate-200/50 dark:border-white/10">
                        {PRESETS.map(preset => (
                            <button
                                key={preset.value}
                                onClick={() => {
                                    onPresetSelect(preset.value);
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                                    currentPreset === preset.value
                                        ? "bg-primary-500 text-white border-primary-500 shadow-sm"
                                        : "bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                                )}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {/* Date Inputs Manual */}
                    <div className="flex gap-2 mb-4">
                        <div className="flex-1">
                            <label className="text-[10px] uppercase text-slate-500 mb-1 block">Início</label>
                            <input
                                type="date"
                                className="app-input w-full text-xs py-1.5 px-2"
                                value={startDate || ''}
                                onChange={(e) => onRangeChange(e.target.value, endDate)}
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] uppercase text-slate-500 mb-1 block">Fim</label>
                            <input
                                type="date"
                                className="app-input w-full text-xs py-1.5 px-2"
                                value={endDate || ''}
                                onChange={(e) => onRangeChange(startDate, e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Calendar Header matching AppDatePicker */}
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
                </div>
            )}
        </div>
    );
}
