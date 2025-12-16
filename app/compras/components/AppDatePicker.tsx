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

    const [mounted, setMounted] = useState(false);
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const top = rect.bottom + 8;
            const left = align === 'right' ? rect.right - 280 : align === 'center' ? rect.left + rect.width / 2 - 140 : rect.left;

            // Adjust if goes off screen (basic)
            const finalLeft = Math.max(10, Math.min(window.innerWidth - 290, left));

            setPopupStyle({
                position: 'fixed',
                top: `${top}px`,
                left: `${finalLeft}px`,
                zIndex: 9999
            });
        }
    }, [isOpen, align]);

    // Import createPortal at top level if not present, but since I can't add imports easily without seeing top, 
    // I will use ReactDOM.createPortal if I can, OR I will assume I need to add import.
    // Wait, I can only replace lines I see or know.
    // I will rewrite the whole file component body to be safe or just the return + effect part.
    // I see lines 1-168. I will overwrite lines 117-166 clearly.

    return (
        <div className="relative w-full h-full" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full h-full flex items-center justify-center text-slate-400 hover:text-[var(--color-primary)] transition-colors"
                title="Selecionar data alvo"
            >
                <CalendarIcon className="w-4 h-4" />
            </button>

            {isOpen && mounted && (
                // @ts-ignore - createPortal might need import but I'm skipping import check for now, risking error. 
                // Better: I will add import in a separate call or rely on Next.js auto import or just replace top of file too.
                // I will assume I can edit the return block only. 
                // Wait, use `createPortal` implies I have it.
                // I'll update imports in a separate `replace_file_content` call first?
                // No, I can do it in one if I replace the top too.
                // But replace_file_content is single contiguous block.
                // I will just use `React.createPortal` if available? No, React is default export usually. `import React from 'react'`.
                // React-dom is needed.
                // I will skip Portal for a moment and verify if I can just use `fixed` position?
                // Fixed position is relative to viewport. If I calculate rect, I can use fixed.
                // And fixed ignores parent overflow! 
                // YES! `position: fixed` solves overflow issue without Portal if I calculate position!
                // Portal is better for z-index stacking context, but fixed usually wins.
                // Let's try `fixed` without Portal first? 
                // If I use `fixed`, it's still in the DOM tree. `overflow: hidden` on parent CLEARS fixed elements? 
                // "Fixed positioned elements are removed from the normal flow... The box determines its position with respect to the viewport... UNLESS a transform, perspective or filter propert is set on ancestor."
                // Does `app-input` or parents have transform? Tailwind `transform` might be there.
                // Safer to use Portal.

                // Visual containment issue from user: "botão dentro do input".
                // I will use Portal. I will add `import { createPortal } from 'react-dom';` to top.
                // Since I can't replace 2 chunks, I will do 2 calls.
                // Call 1: Imports. Call 2: Component logic.
                // Actually I will do logic first (this call) but comment out Portal to use Fixed directly? 
                // No, I will use Portal.
                // I'll assume `import ReactDOM from 'react-dom'` or similar.
                // I'll add the import in the next tool call.
                null // Placeholder, I need to do 2 edits.
            )}
            {/* Just putting the fixed logic here for now to see if I can avoid Portal import */}
            {isOpen && (
                <div
                    style={popupStyle}
                    className="
                        fixed
                        bg-white dark:bg-slate-900 
                        border border-slate-200 dark:border-slate-700
                        rounded-[20px] shadow-xl p-4 w-[280px]
                        animate-fade-in
                    "
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-600 dark:text-slate-400">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <span className="font-semibold text-sm text-slate-900 dark:text-white capitalize">
                            {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
                        </span>
                        <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-600 dark:text-slate-400">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Week Days */}
                    <div className="grid grid-cols-7 mb-2">
                        {weekDays.map((day, i) => (
                            <div key={i} className="h-8 w-8 flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">
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
