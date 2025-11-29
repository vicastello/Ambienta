'use client';

import { useEffect, useState } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'theme-mode';

const resolveInitialMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // ignore read errors and fall back to system
  }
  return 'system';
};

function applyTheme(mode: ThemeMode) {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  const prefersDark =
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  let dark = false;

  if (mode === 'dark') dark = true;
  else if (mode === 'light') dark = false;
  else dark = prefersDark;

  if (dark) root.classList.add('dark');
  else root.classList.remove('dark');
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(resolveInitialMode);

  // salva sempre que mudar
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
      applyTheme(mode);
    } catch {
      // ignora
    }
  }, [mode]);

  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-500 dark:text-slate-400">
        Aparência
      </span>

      <div className="inline-flex rounded-full border border-slate-200/70 bg-white/80 text-[11px] shadow-sm overflow-hidden dark:border-slate-600/70 dark:bg-slate-900/80">
        <button
          type="button"
          onClick={() => setMode('light')}
          className={
            'px-2 py-1 transition-colors ' +
            (mode === 'light'
              ? 'bg-sky-500 text-white'
              : 'text-slate-600 dark:text-slate-300')
          }
          title="Modo claro"
        >
          ☀️
        </button>
        <button
          type="button"
          onClick={() => setMode('system')}
          className={
            'px-2 py-1 border-x border-slate-200/70 dark:border-slate-700 transition-colors ' +
            (mode === 'system'
              ? 'bg-sky-500 text-white'
              : 'text-slate-600 dark:text-slate-300')
          }
          title="Seguir sistema"
        >
          🖥️
        </button>
        <button
          type="button"
          onClick={() => setMode('dark')}
          className={
            'px-2 py-1 transition-colors ' +
            (mode === 'dark'
              ? 'bg-sky-500 text-white'
              : 'text-slate-600 dark:text-slate-300')
          }
          title="Modo escuro"
        >
          🌙
        </button>
      </div>
    </div>
  );
}