'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

type AppLayoutProps = {
  title?: string;
  children: React.ReactNode;
};

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/pedidos', label: 'Pedidos' },
  { href: '/produtos', label: 'Produtos' },
  { href: '/clientes', label: 'Clientes' },
  { href: '/financeiro', label: 'Financeiro' },
  { href: '/configuracoes', label: 'Configurações' },
];

export function AppLayout({ title, children }: AppLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex bg-[var(--bg-body)] text-[var(--text-main)]">
      {/* Sidebar */}
      <aside className="w-60 border-r app-border-subtle bg-[var(--bg-card-soft)]/90 backdrop-blur-xl flex flex-col">
        <div className="px-4 py-4 border-b app-border-subtle">
          <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
            Tiny Gestor
          </div>
          <div className="text-sm font-semibold">Painel Ambienta</div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 text-sm">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  'flex items-center px-3 py-2 rounded-xl transition-colors ' +
                  (active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
                    : 'text-[var(--text-muted)] hover:bg-slate-200/60 dark:hover:bg-slate-800/80')
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t app-border-subtle">
          <ThemeToggle />
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main className="flex-1 flex flex-col">
        {/* Header da página */}
        {title && (
          <header className="border-b app-border-subtle bg-[var(--bg-card-soft)]/90 backdrop-blur-md">
            <div className="px-4 py-3">
              <h1 className="text-base font-semibold tracking-tight">
                {title}
              </h1>
            </div>
          </header>
        )}

        {/* Área de conteúdo com nosso “app-shell” */}
        <div className="app-shell">
          <div className="app-shell-inner">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}