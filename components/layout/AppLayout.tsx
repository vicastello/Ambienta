'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
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
  Menu,
  X,
  ShoppingCart,
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
  { href: '/compras', label: 'Compras', icon: ShoppingCart },
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) =>
  ['/dashboard', '/pedidos', '/produtos', '/financeiro', '/compras'].includes(item.href)
);

export function AppLayout({ title, children }: AppLayoutProps) {
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  // Default to mobile to avoid desktop flash before hydration; effect below corrects based on viewport
  const [isMobile, setIsMobile] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1024px)');
    const updateMatch = (event: MediaQueryListEvent | MediaQueryList) => {
      const matches = event.matches;
      setIsMobile(matches);
      if (!matches) setIsMobileMenuOpen(false);
    };
    updateMatch(mq);
    const handler = (event: MediaQueryListEvent) => updateMatch(event);
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsHovered(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const isExpanded = !isMobile && (isHovered || isPinned);
  const showSidebar = !isMobile || isMobileMenuOpen;
  const logoIcon = (
    <div className="relative h-10 w-10 flex-shrink-0">
      <Image
        src="/brand/logo-icon.svg"
        alt="Ambienta"
        fill
        className="object-contain"
        sizes="40px"
        priority
      />
    </div>
  );

  const logoHorizontal = (
    <div className="relative h-10 w-[9.5rem] flex-shrink-0 transition-all duration-300">
      <Image
        src="/brand/logo-horizontal-light.svg"
        alt="Ambienta Tiny Gestor"
        fill
        className="object-contain dark:hidden"
        sizes="152px"
        priority
      />
      <Image
        src="/brand/logo-horizontal-dark.svg"
        alt="Ambienta Tiny Gestor"
        fill
        className="object-contain hidden dark:block"
        sizes="152px"
        priority
      />
    </div>
  );

  return (
    <div className="liquid-bg min-h-screen flex">
      {/* Static background orbs for liquid glass effect */}
      <div className="liquid-orb orb-1" aria-hidden />
      <div className="liquid-orb orb-2" aria-hidden />
      <div className="liquid-orb orb-3" aria-hidden />

      {/* Mobile backdrop */}
      {isMobile && (
        <div
          className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 ${
            isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full z-50 transition-all duration-300 ease-out ${
          showSidebar ? 'translate-x-0' : '-translate-x-full'
        } ${
          isMobile ? 'w-[86vw] max-w-sm' : isExpanded ? 'w-64' : 'w-20'
        }`}
        onMouseEnter={() => !isMobile && setIsHovered(true)}
        onMouseLeave={() => !isMobile && setIsHovered(false)}
      >
        {/* Glassmorphism background */}
        <div className="absolute inset-0 glass-panel border-r border-white/50 dark:border-slate-800/50" />

        <div className="relative h-full flex flex-col">
          {/* Header */}
          <div className="px-5 py-6 border-b border-white/40 dark:border-slate-800/40">
            <div className="flex items-center gap-3">
              <div className={`flex ${isMobile ? 'flex-1 justify-center' : ''}`}>
                {isExpanded || isMobile ? logoHorizontal : logoIcon}
              </div>

              {isMobile && (
                <button
                  className="ml-auto rounded-full p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Fechar menu"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
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
                  onClick={() => {
                    setIsHovered(false);
                    setIsMobileMenuOpen(false);
                  }}
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
                      isExpanded || isMobile ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
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

      {/* Mobile top bar */}
          {isMobile && (
          <div className="lg:hidden fixed top-0 inset-x-0 z-40 px-4 py-3 grid grid-cols-3 items-center glass-panel border-b border-white/60 dark:border-slate-800/60">
            <div className="flex justify-start">
              <button
                onClick={() => setIsMobileMenuOpen((open) => !open)}
                className="rounded-2xl border border-white/60 dark:border-slate-800/70 bg-white/70 dark:bg-slate-800/70 p-2 text-slate-700 dark:text-slate-200 shadow-sm"
                aria-label="Abrir menu"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
            <div className="flex justify-center">
              <div className="relative h-8 w-36 max-w-[60vw]">
                <Image
                  src="/brand/logo-horizontal-light.svg"
                  alt="Ambienta Tiny Gestor"
                  fill
                  className="object-contain dark:hidden"
                  sizes="144px"
                  priority
                />
                <Image
                  src="/brand/logo-horizontal-dark.svg"
                  alt="Ambienta Tiny Gestor"
                  fill
                  className="object-contain hidden dark:block"
                  sizes="144px"
                  priority
                />
              </div>
            </div>
            <div className="flex justify-end">{/* spacer to keep logo centralizado */}</div>
          </div>
      )}

      {/* Main content */}
      <main
        className={`flex-1 transition-all duration-300 ${
          isMobile ? 'ml-0' : isExpanded ? 'ml-64' : 'ml-20'
        }`}
      >
        <div className="w-full max-w-[1600px] mx-auto relative z-10">
          <div
            className={`relative min-h-screen px-4 sm:px-6 lg:px-12 ${
              isMobile ? 'pt-20 pb-28' : 'pt-8 pb-10'
            }`}
            style={
              isMobile
                ? {
                    paddingTop: '5rem',
                    paddingBottom: '6.5rem',
                  }
                : undefined
            }
          >
          <div className="pointer-events-none absolute inset-0 ">
            <div className="absolute -top-20 left-20 h-64 w-64 rounded-full bg-[#c7d7ff] blur-[140px] opacity-70" />
            <div className="absolute top-20 right-10 h-72 w-72 rounded-full bg-[#ffd6ff] blur-[160px] opacity-60" />
            <div className="absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-[#d1fff0] blur-[150px] opacity-50" />
          </div>

          <div className="relative z-10 space-y-6">
            {title && (
              <header className="rounded-[32px] shadow-inner shadow-white/40 border border-white/50 dark:border-slate-800/50 glass-panel shadow-[0_15px_45px_rgba(15,23,42,0.12)] px-6 py-5 flex flex-col gap-2">
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
        </div>
      </main>

      {/* Bottom nav (mobile) */}
      {isMobile && (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass-panel border-t border-white/60 dark:border-slate-800/60 shadow-[0_-10px_30px_rgba(15,23,42,0.18)]">
          <div className="grid grid-cols-4 gap-1 px-2 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2">
            {MOBILE_NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition ${
                    active
                      ? 'bg-[#009DA8]/15 text-[#006e76] dark:text-[#6fe8ff]'
                      : 'text-slate-500 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800/70'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Icon className={`w-5 h-5 ${active ? 'scale-110' : ''}`} />
                  <span className="leading-none">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
