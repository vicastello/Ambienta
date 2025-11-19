'use client';

import { useState, useRef, useEffect } from 'react';
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
};

export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  onClear,
  singleSelect = false,
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 8,
      left: rect.left,
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

  const displayText =
    selected.length === 0
      ? 'Selecione...'
      : selected.length === 1
        ? `${selected.length} selecionado`
        : `${selected.length} selecionados`;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-2xl border app-border-subtle bg-[var(--bg-card-soft)] text-[var(--text-main)] hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <span className="text-sm">{displayText}</span>
        <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        ReactDOM.createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] w-64 bg-white/60 dark:bg-slate-950/60 border border-white/40 dark:border-slate-700/40 rounded-2xl shadow-lg"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
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
                  setIsOpen(false);
                }}
                className="text-xs px-3 py-1 rounded-full bg-transparent text-[var(--text-muted)] hover:bg-slate-200/40 dark:hover:bg-slate-800/60"
              >
                Limpar
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-xs px-3 py-1 rounded-full bg-sky-500 text-white hover:bg-sky-600"
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
