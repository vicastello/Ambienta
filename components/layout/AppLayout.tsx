'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  DollarSign,
  Settings,
  Menu,
  X,
  ShoppingCart,
} from 'lucide-react';
import { GlassHorizontalNav, GlassVerticalNav } from '@/src/components/navigation/GlassVerticalNav';

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
const GLASS_NAV_ITEMS = NAV_ITEMS.map(({ label, icon }) => ({ id: label, label, icon }));
const MOBILE_GLASS_ITEMS = MOBILE_NAV_ITEMS.map(({ label, icon }) => ({ id: label, label, icon }));

export function AppLayout({ title, children }: AppLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const computeNavIndex = useCallback(
    (path?: string | null) => {
      if (!path) return 0;
      const foundIndex = NAV_ITEMS.findIndex((item) =>
        path === '/' ? item.href === '/dashboard' : path.startsWith(item.href)
      );
      return foundIndex >= 0 ? foundIndex : 0;
    },
    []
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const computeMobileNavIndex = useCallback(
    (path?: string | null) => {
      if (!path) return 0;
      const foundIndex = MOBILE_NAV_ITEMS.findIndex((item) =>
        path === '/' ? item.href === '/dashboard' : path.startsWith(item.href)
      );
      return foundIndex >= 0 ? foundIndex : 0;
    },
    []
  );
  const navTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const raf = window.requestAnimationFrame(() => {
      setIsMobileMenuOpen(false);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [pathname]);

  useEffect(() => {
    // Prefetch main routes to smooth navigation and avoid visible stalls
    NAV_ITEMS.forEach((item) => {
      router.prefetch?.(item.href);
    });
  }, [router]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const activeNavIndex = useMemo(() => computeNavIndex(pathname), [computeNavIndex, pathname]);
  const activeMobileNavIndex = useMemo(
    () => computeMobileNavIndex(pathname),
    [computeMobileNavIndex, pathname]
  );

  const handleNavChange = useCallback(
    (index: number) => {
      const target = NAV_ITEMS[index];
      if (!target || pathname === target.href) return;
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
      navTimerRef.current = setTimeout(() => {
        startTransition(() => {
          router.push(target.href);
        });
      }, 180);
    },
    [pathname, router]
  );

  const handleMobileNavChange = useCallback(
    (index: number) => {
      const target = MOBILE_NAV_ITEMS[index];
      if (!target || pathname === target.href) return;
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
      navTimerRef.current = setTimeout(() => {
        startTransition(() => {
          router.push(target.href);
        });
      }, 180);
    },
    [pathname, router]
  );
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

      {/* Mobile backdrop */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-slate-900/60 transition-opacity duration-300 ${
          isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      {/* Desktop sidebar (only visible on lg+) */}
      <aside
        className="hidden lg:block fixed left-5 top-0 h-full z-40 w-14 transition-all duration-300 ease-out"
      >
        <div className="relative h-full flex flex-col">
          <div className="flex flex-col items-center gap-6 w-full pt-8">
            <div className="flex w-10 justify-center">{logoIcon}</div>
            <GlassVerticalNav
              activeIndex={activeNavIndex}
              onChange={handleNavChange}
              items={GLASS_NAV_ITEMS}
              className="w-10"
            />
          </div>
          <div className="pb-6 pt-6">
            <div className="text-[10px] text-center text-slate-500 dark:text-slate-600 font-mono uppercase tracking-wider opacity-70">
              Build: 2025-11-20 16:00
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <aside
        className={`lg:hidden fixed left-0 top-0 h-full z-50 w-[86vw] max-w-sm transition-all duration-300 ease-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="absolute inset-0 glass-panel glass-tint border-r border-white/50 dark:border-slate-800/50" />
        <div className="relative h-full flex flex-col">
          <div className="px-5 py-6 border-b border-white/40 dark:border-slate-800/40">
            <div className="flex items-center gap-3">
              <div className="flex flex-1 justify-center">{logoHorizontal}</div>
              <button
                className="ml-auto rounded-full p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <nav className="flex-1 px-3 py-6 overflow-y-auto">
            <div className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`group relative flex items-center gap-3 px-3 py-3 rounded-2xl transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-[#009DA8]/15 via-[#00B5C3]/10 to-transparent text-[#009DA8] dark:text-[#00B5C3]'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 hover:text-slate-900 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-[#009DA8] to-[#00B5C3] rounded-r-full" />
                    )}
                    <Icon
                      className={`w-5 h-5 flex-shrink-0 ${active ? 'scale-110' : 'group-hover:scale-110'} transition-transform duration-200`}
                    />
                    <span className="font-medium text-sm whitespace-nowrap">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="px-3 border-t border-white/30 dark:border-slate-800/40 pt-4 pb-5">
            <div className="text-[10px] text-center text-slate-500 dark:text-slate-600 font-mono uppercase tracking-wider opacity-70">
              Build: 2025-11-20 16:00
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 px-4 py-3 grid grid-cols-3 items-center glass-panel glass-tint border-b border-white/60 dark:border-slate-800/60">
        <div className="flex justify-start">
          <button
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="rounded-2xl bg-white/80 dark:bg-slate-800/80 p-2 text-slate-700 dark:text-slate-200 shadow-sm"
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

      {/* Main content */}
      <main className="flex-1 transition-all duration-300 ml-0 lg:ml-[4.5rem]">
        <div className="w-full max-w-[1600px] mx-auto relative z-10">
          <div className="relative min-h-screen px-4 sm:px-6 lg:px-12 pt-20 pb-28 lg:pt-8 lg:pb-10">
          <div className="pointer-events-none absolute inset-0 ">
            <div className="absolute -top-20 left-20 h-64 w-64 rounded-full bg-[#c7d7ff] blur-[140px] opacity-70" />
            <div className="absolute top-20 right-10 h-72 w-72 rounded-full bg-[#ffd6ff] blur-[160px] opacity-60" />
            <div className="absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-[#d1fff0] blur-[150px] opacity-50" />
          </div>

          <div className="relative z-10 space-y-6" data-page-title={title ?? undefined}>
            {title && (
              <h1 className="sr-only" aria-live="polite">
                {title}
              </h1>
            )}
            <div className="pb-4">
              {children}
            </div>
          </div>
        </div>
        </div>
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-center justify-center pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 bg-transparent">
        <div className="px-0">
          <GlassHorizontalNav
            activeIndex={activeMobileNavIndex}
            onChange={handleMobileNavChange}
            items={MOBILE_GLASS_ITEMS}
          />
        </div>
      </nav>
    </div>
  );
}
