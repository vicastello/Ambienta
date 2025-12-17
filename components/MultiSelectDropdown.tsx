'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';

type Option = {
  value: string | number;
  label: string;
};

type MultiSelectDropdownProps = {
  label: string;
  options: Option[];
  selected: (string | number)[];
  onChange: (values: (string | number)[]) => void;
  onClear: () => void;
  singleSelect?: boolean;
  displayFormatter?: (values: (string | number)[], options: Option[]) => string;
  showLabel?: boolean;
};

export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  onClear,
  singleSelect = false,
  displayFormatter,
  showLabel = true,
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 256 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    const horizontalPadding = 12;
    const maxWidth = Math.min(360, viewportWidth - horizontalPadding * 2);
    const clampedWidth = Math.max(Math.min(rect.width, maxWidth), Math.min(240, maxWidth));
    const left = Math.min(
      Math.max(rect.left, horizontalPadding),
      viewportWidth - clampedWidth - horizontalPadding
    );
    setPosition({
      top: rect.bottom + 8,
      left,
      width: clampedWidth,
    });
  }, [isOpen]);

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

  const toggleOption = (value: string | number) => {
    if (singleSelect) {
      if (selected.includes(value)) {
        onChange([]);
      } else {
        onChange([value]);
      }
    } else {
      if (selected.includes(value)) {
        onChange(selected.filter((v) => v !== value));
      } else {
        onChange([...selected, value]);
      }
    }
  };

  const displayText = useMemo(() => {
    if (displayFormatter) {
      return displayFormatter(selected, options);
    }
    if (selected.length === 0) return 'Selecione...';
    if (selected.length === 1) return `${selected.length} selecionado`;
    return `${selected.length} selecionados`;
  }, [displayFormatter, options, selected]);

  return (
    <>
      {label && showLabel && (
        <div className="mb-1 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          {label}
        </div>
      )}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="glass-input flex items-center justify-between gap-2 h-10 px-4 py-2 cursor-pointer hover:brightness-95 dark:hover:brightness-110 active:scale-[0.98]"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label}
      >
        <span className="truncate">{displayText}</span>
        <span className={`transition-transform text-xs opacity-50 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        ReactDOM.createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] glass-panel rounded-2xl overflow-hidden"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: position.width,
              maxWidth: 'calc(100vw - 24px)',
            }}
          >
            <div className="max-h-80 overflow-y-auto">
              {options.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors border-b border-white/20 dark:border-slate-700/20 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option.value)}
                    onChange={() => toggleOption(option.value)}
                    className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                  />
                  <span className="text-sm text-[var(--text-main)]">{option.label}</span>
                </label>
              ))}
            </div>

            <div className="border-t border-white/20 dark:border-slate-700/20 px-4 py-2 flex justify-between gap-2">
              <button
                onClick={() => {
                  onChange([]);
                  onClear();
                  setIsOpen(false);
                }}
                className="glass-btn glass-btn-ghost text-xs px-3 py-1 rounded-full h-auto"
              >
                Limpar
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="glass-btn glass-btn-primary text-xs px-3 py-1 rounded-full h-auto"
              >
                Fechar
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
