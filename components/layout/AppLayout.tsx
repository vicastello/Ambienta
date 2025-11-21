'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  DollarSign,
  Settings,
  ChevronRight,
  Pin,
  PinOff,
} from 'lucide-react';

type AppLayoutProps = {
  title?: string;
  children: React.ReactNode;
};

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pedidos', label: 'Pedidos', icon: ShoppingBag },
  { href: '/produtos', label: 'Produtos', icon: Package },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function AppLayout({ title, children }: AppLayoutProps) {
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const isExpanded = isHovered || isPinned;

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[#e3edff] via-[#f5f6ff] to-[#fde7ff] dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full z-50 transition-all duration-300 ease-out ${
          isExpanded ? 'w-64' : 'w-20'
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Glassmorphism background */}
        <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-white/50 dark:border-slate-800/50 shadow-[0_20px_60px_rgba(15,23,42,0.18)]" />

        <div className="relative h-full flex flex-col">
          {/* Header */}
          <div className="px-5 py-6 border-b border-white/40 dark:border-slate-800/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#009DA8] via-[#3ec5ce] to-[#B4F8FF] flex items-center justify-center text-white font-bold text-lg shadow-lg flex-shrink-0">
                A
              </div>
              <div
                className={`transition-all duration-300 overflow-hidden ${
                  isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
                }`}
              >
                <div className="text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                  Ambienta
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  Tiny Gestor
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsHovered(false)}
                  className={`group relative flex items-center gap-3 px-3 py-3 rounded-2xl transition-all duration-200 ${
                    active
                      ? 'bg-gradient-to-r from-[#009DA8]/15 via-[#00B5C3]/10 to-transparent text-[#009DA8] dark:text-[#00B5C3] shadow-md shadow-[#009DA8]/15'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 hover:text-slate-900 dark:hover:bg-slate-800/60'
                  }`}
                >
                  {/* Active indicator */}
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-[#009DA8] to-[#00B5C3] rounded-r-full" />
                  )}

                  <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'scale-110' : 'group-hover:scale-110'} transition-transform duration-200`} />

                  <span
                    className={`font-medium text-sm whitespace-nowrap transition-all duration-300 ${
                      isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
                    }`}
                  >
                    {item.label}
                  </span>

                  {active && isExpanded && (
                    <ChevronRight className="w-4 h-4 ml-auto opacity-40" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="px-3 pb-4 space-y-3 border-t border-white/40 dark:border-slate-800/40 pt-4">
            {/* Pin/Unpin button */}
            <button
              onClick={() => setIsPinned(!isPinned)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all duration-200 ${
                isPinned
                  ? 'bg-slate-200/80 dark:bg-slate-800/80 text-[#009DA8] dark:text-[#00B5C3]'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/50'
              }`}
              title={isPinned ? 'Desafixar menu' : 'Fixar menu expandido'}
            >
              {isPinned ? (
                <Pin className="w-4 h-4 flex-shrink-0" />
              ) : (
                <PinOff className="w-4 h-4 flex-shrink-0" />
              )}
              <span
                className={`text-xs font-medium whitespace-nowrap transition-all duration-300 ${
                  isExpanded ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {isPinned ? 'Desafixar' : 'Fixar menu'}
              </span>
            </button>

            {/* Theme toggle */}
            <div className={`${isExpanded ? 'px-3' : 'px-0'} transition-all duration-300`}>
              <ThemeToggle />
            </div>

            {/* Version */}
            <div
              className={`text-[9px] text-slate-400 dark:text-slate-600 text-center font-mono transition-all duration-300 ${
                isExpanded ? 'opacity-60' : 'opacity-0'
              }`}
              suppressHydrationWarning
            >
              Build: 2025-11-20 16:00
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={`flex-1 transition-all duration-300 ${
          isExpanded ? 'ml-64' : 'ml-20'
        }`}
      >
        <div className="relative min-h-screen px-4 py-6 sm:px-8 lg:px-12">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-20 left-20 h-64 w-64 rounded-full bg-[#c7d7ff] blur-[140px] opacity-70" />
            <div className="absolute top-20 right-10 h-72 w-72 rounded-full bg-[#ffd6ff] blur-[160px] opacity-60" />
            <div className="absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-[#d1fff0] blur-[150px] opacity-50" />
          </div>

          <div className="relative z-10 space-y-6">
            {title && (
              <header className="rounded-[32px] border border-white/50 dark:border-slate-800/50 bg-white/70 dark:bg-slate-900/60 backdrop-blur-2xl shadow-[0_15px_45px_rgba(15,23,42,0.12)] px-6 py-5 flex flex-col gap-2">
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400 dark:text-slate-500">Painel</p>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Acompanhe a saúde do seu e-commerce em uma experiência visual inspirada em apps iOS.</p>
              </header>
            )}

            <div className="pb-4">
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
