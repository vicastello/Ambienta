import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface AppDatePickerProps {
    date?: Date | null;
    onSelect: (date: Date) => void;
    minDate?: Date;
    maxDate?: Date;
    align?: 'left' | 'right' | 'center';
}

export function AppDatePicker({
    date,
    onSelect,
    minDate,
    maxDate,
    align = 'left'
}: AppDatePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(date || new Date());
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
        onSelect(newDate);
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
            const isDisabled = (minDate && currentOnlyDate(currentDate) < currentOnlyDate(minDate)) ||
                (maxDate && currentOnlyDate(currentDate) > currentOnlyDate(maxDate));

            days.push(
                <button
                    key={day}
                    onClick={() => !isDisabled && handleDateClick(day)}
                    disabled={isDisabled}
                    className={`
                        h-8 w-8 rounded-full text-xs font-medium flex items-center justify-center transition-colors
                        ${isSelected
                            ? 'bg-[var(--color-primary)] text-white shadow-md shadow-[var(--color-primary)]/30'
                            : isToday
                                ? 'bg-[var(--color-neutral-100)] dark:bg-[var(--color-neutral-700)] text-[var(--color-primary)] font-bold'
                                : 'text-[var(--color-neutral-700)] dark:text-[var(--color-neutral-300)] hover:bg-[var(--color-neutral-100)] dark:hover:bg-[var(--color-neutral-800)]'
                        }
                        ${isDisabled ? 'opacity-30 cursor-not-allowed' : ''}
                    `}
                >
                    {day}
                </button>
            );
        }

        return days;
    };

    // Helper to compare dates without time
    const currentOnlyDate = (d: Date) => {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    };

    const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    return (
        <div className="relative w-full h-full" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full h-full flex items-center justify-center text-[var(--color-neutral-400)] hover:text-[var(--color-primary)] transition-colors"
                title="Selecionar data alvo"
            >
                <CalendarIcon className="w-4 h-4" />
            </button>

            {isOpen && (
                <div className={`
                    absolute top-full mt-2 z-[100] 
                    bg-white dark:bg-slate-900 
                    border border-[var(--color-neutral-200)] dark:border-[var(--color-neutral-700)]
                    rounded-[20px] shadow-xl p-4 w-[280px]
                    animate-fade-in
                    ${align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'}
                `}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={handlePrevMonth} className="p-1 hover:bg-[var(--color-neutral-100)] dark:hover:bg-[var(--color-neutral-800)] rounded-full text-[var(--color-neutral-600)] dark:text-[var(--color-neutral-400)]">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <span className="font-semibold text-sm text-[var(--color-neutral-900)] dark:text-white capitalize">
                            {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
                        </span>
                        <button onClick={handleNextMonth} className="p-1 hover:bg-[var(--color-neutral-100)] dark:hover:bg-[var(--color-neutral-800)] rounded-full text-[var(--color-neutral-600)] dark:text-[var(--color-neutral-400)]">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Week Days */}
                    <div className="grid grid-cols-7 mb-2">
                        {weekDays.map((day, i) => (
                            <div key={i} className="h-8 w-8 flex items-center justify-center text-[10px] font-bold text-[var(--color-neutral-400)] uppercase">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Days Grid */}
                    <div className="grid grid-cols-7 gap-y-1">
                        {renderCalendarDays()}
                    </div>
                </div>
            )}
        </div>
    );
}
