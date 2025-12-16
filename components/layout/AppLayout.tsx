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
  Store,
  FileText,
  Box,
  Wallet,
  TrendingUp,
} from 'lucide-react';
import { GlassHorizontalNav, GlassVerticalNav } from '@/src/components/navigation/GlassVerticalNav';

type AppLayoutProps = {
  title?: string;
  children: React.ReactNode;
};

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pedidos', label: 'Pedidos', icon: ShoppingBag },
  { href: '/marketplaces', label: 'Marketplaces', icon: Store },
  { href: '/produtos', label: 'Produtos', icon: Package },
  { href: '/embalagens', label: 'Embalagens', icon: Box },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/compras', label: 'Compras', icon: ShoppingCart },
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/relatorios', label: 'Relatórios', icon: FileText },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) =>
  ['/dashboard', '/pedidos', '/produtos', '/financeiro', '/compras', '/marketplaces'].includes(item.href)
);

// Desktop menu - apenas seções principais
const DESKTOP_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/vendas', label: 'Vendas', icon: TrendingUp }, // Irá abrir popup
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign }, // Popup existente
  { href: '/operacoes', label: 'Operações', icon: Package }, // Irá abrir popup
  { href: '/marketplaces', label: 'Marketplaces', icon: Store }, // Popup existente
  { href: '/relatorios', label: 'Relatórios', icon: FileText }, // Popup existente
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

const GLASS_NAV_ITEMS = DESKTOP_NAV_ITEMS.map(({ label, icon }) => ({
  id: label,
  label,
  icon,
  disableTooltip: ['Vendas', 'Financeiro', 'Operações', 'Marketplaces', 'Relatórios'].includes(label),
}));
const MOBILE_GLASS_ITEMS = MOBILE_NAV_ITEMS.map(({ label, icon }) => ({
  id: label,
  label,
  icon,
  disableTooltip: label === 'Marketplaces',
}));

export function AppLayout({ title, children }: AppLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showMarketplaceMenu, setShowMarketplaceMenu] = useState(false);
  const [showRelatoriosMenu, setShowRelatoriosMenu] = useState(false);
  const [showFinanceiroMenu, setShowFinanceiroMenu] = useState(false);
  const [showVendasMenu, setShowVendasMenu] = useState(false);
  const [showOperacoesMenu, setShowOperacoesMenu] = useState(false);
  const computeNavIndex = useCallback(
    (path?: string | null) => {
      if (!path) return 0;
      const foundIndex = DESKTOP_NAV_ITEMS.findIndex((item) =>
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
    DESKTOP_NAV_ITEMS.forEach((item) => {
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowMarketplaceMenu(false);
    setShowRelatoriosMenu(false);
    setShowFinanceiroMenu(false);
    setShowVendasMenu(false);
    setShowOperacoesMenu(false);
  }, [pathname]);

  const activeNavIndex = useMemo(() => computeNavIndex(pathname), [computeNavIndex, pathname]);
  const activeMobileNavIndex = useMemo(
    () => computeMobileNavIndex(pathname),
    [computeMobileNavIndex, pathname]
  );

  const handleNavChange = useCallback(
    (index: number) => {
      const target = DESKTOP_NAV_ITEMS[index];
      if (!target || pathname === target.href) return;
      if (target.href === '/vendas') {
        setShowVendasMenu(true);
        return;
      }
      if (target.href === '/operacoes') {
        setShowOperacoesMenu(true);
        return;
      }
      if (target.href === '/marketplaces') {
        setShowMarketplaceMenu(true);
        return;
      }
      if (target.href === '/relatorios') {
        setShowRelatoriosMenu(true);
        return;
      }
      if (target.href === '/financeiro') {
        setShowFinanceiroMenu(true);
        return;
      }
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
      if (target.href === '/marketplaces') {
        setShowMarketplaceMenu(true);
        return;
      }
      if (target.href === '/financeiro') {
        setShowFinanceiroMenu(true);
        return;
      }
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
      navTimerRef.current = setTimeout(() => {
        startTransition(() => {
          router.push(target.href);
        });
      }, 180);
    },
    [pathname, router]
  );

  const handleNavHover = useCallback((index: number) => {
    const target = NAV_ITEMS[index];
    if (!target || target.href !== '/marketplaces') return;
    // Hover no marketplace não abre/fecha nada para evitar flicker
  }, []);

  const handleMobileNavHover = useCallback((index: number) => {
    const target = MOBILE_NAV_ITEMS[index];
    if (!target || target.href !== '/marketplaces') return;
    // Hover no marketplace não abre/fecha nada para evitar flicker
  }, []);
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
        className={`lg:hidden fixed inset-0 z-40 bg-slate-900/60 transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      {/* Desktop sidebar (only visible on lg+) */}
      <aside className="hidden lg:block fixed left-5 top-0 h-full z-40 w-14 transition-all duration-300 ease-out">
        <div className="relative h-full flex flex-col">
          <div className="flex flex-col items-center gap-6 w-full pt-8">
            <div className="flex w-10 justify-center">{logoIcon}</div>
            <GlassVerticalNav
              activeIndex={activeNavIndex}
              onChange={handleNavChange}
              onItemHover={handleNavHover}
              onMarketplaceHover={() => setShowMarketplaceMenu(true)}
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
      {showMarketplaceMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMarketplaceMenu(false)} />
          <div
            className="fixed z-50 left-20"
            style={{
              top: `calc(8rem + ${DESKTOP_NAV_ITEMS.findIndex(i => i.href === '/marketplaces') * (22 + 36)}px + 11px)`,
              transform: 'translateY(-50%)'
            }}
          >
            <div className="rounded-2xl glass-panel glass-tint border border-white/60 dark:border-slate-800/60 shadow-2xl p-3 w-64">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-slate-300 mb-2">
                Escolha o marketplace
              </p>
              <div className="space-y-2">
                <button
                  className="w-full text-left rounded-xl bg-white/70 dark:bg-slate-900/70 border border-white/60 dark:border-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-[#009DA8]/60 hover:text-[#009DA8]"
                  onClick={() => {
                    setShowMarketplaceMenu(false);
                    router.push('/marketplaces/shopee');
                  }}
                >
                  Shopee
                </button>
                <button
                  className="w-full text-left rounded-xl bg-white/70 dark:bg-slate-900/70 border border-white/60 dark:border-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-[#009DA8]/60 hover:text-[#009DA8]"
                  onClick={() => {
                    setShowMarketplaceMenu(false);
                    router.push('/marketplaces/mercado-livre');
                  }}
                >
                  Mercado Livre
                </button>
                <button
                  className="w-full text-left rounded-xl bg-white/70 dark:bg-slate-900/70 border border-white/60 dark:border-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-[#009DA8]/60 hover:text-[#009DA8]"
                  onClick={() => {
                    setShowMarketplaceMenu(false);
                    router.push('/marketplaces/magalu');
                  }}
                >
                  Magalu
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {showRelatoriosMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowRelatoriosMenu(false)} />
          <div
            className="fixed z-50 left-20"
            style={{
              top: `calc(8rem + ${DESKTOP_NAV_ITEMS.findIndex(i => i.href === '/relatorios') * (22 + 36)}px + 11px)`,
              transform: 'translateY(-50%)'
            }}
          >
            <div className="rounded-2xl glass-panel glass-tint border border-white/60 dark:border-slate-800/60 shadow-2xl p-3 w-64">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-slate-300 mb-2">
                Escolha o relatório
              </p>
              <div className="space-y-2">
                <button
                  className="w-full text-left rounded-xl bg-white/70 dark:bg-slate-900/70 border border-white/60 dark:border-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-[#009DA8]/60 hover:text-[#009DA8]"
                  onClick={() => {
                    setShowRelatoriosMenu(false);
                    router.push('/relatorios/vinculos');
                  }}
                >
                  Vincular Pedidos
                </button>
                <button
                  className="w-full text-left rounded-xl bg-white/70 dark:bg-slate-900/70 border border-white/60 dark:border-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-[#009DA8]/60 hover:text-[#009DA8]"
                  onClick={() => {
                    setShowRelatoriosMenu(false);
                    router.push('/relatorios/vendas-mensais');
                  }}
                >
                  Vendas Mensais
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {showVendasMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowVendasMenu(false)} />
          <div
            className="fixed z-50 left-20"
            style={{
              top: `calc(8rem + ${DESKTOP_NAV_ITEMS.findIndex(i => i.href === '/vendas') * (22 + 36)}px + 11px)`,
              transform: 'translateY(-50%)'
            }}
          >
            <div className="rounded-2xl glass-panel glass-tint border border-white/60 dark:border-slate-800/60 shadow-2xl p-3 w-64">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500 dark dark:text-slate-300 mb-2">
                Vendas
              </p>
              <div className="space-y-2">
                <button
                  className="w-full text-left rounded-xl bg-white/70 dark:bg-slate-900/70 border border-white/60 dark:border-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-[#009DA8]/60 hover:text-[#009DA8]"
                  onClick={() => {
                    setShowVendasMenu(false);
                    router.push('/pedidos');
                  }}
                >
                  Pedidos
                </button>
                <button
                  className="w-full text-left rounded-xl bg-white/70 dark:bg-slate-900/70 border border-white/60 dark:border-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-[#009DA8]/60 hover:text-[#009DA8]"
                  onClick={() => {
                    setShowVendasMenu(false);
                    router.push('/produtos');
                  }}
                >
                  Produtos
                </button>
                <button
                  className="w-full text-left rounded-xl bg-white/70 dark:bg-slate-900/70 border border-white/60 dark:border-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-[#009DA8]/60 hover:text-[#009DA8]"
                  onClick={() => {
                    setShowVendasMenu(false);
                    router.push('/clientes');
                  }}
                >
                  Clientes
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {showOperacoesMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowOperacoesMenu(false)} />
          <div
            className="fixed z-50 left-20"
            style={{
              top: `calc(8rem + ${DESKTOP_NAV_ITEMS.findIndex(i => i.href === '/operacoes') * (22 + 36)}px + 11px)`,
              transform: 'translateY(-50%)'
            }}
          >
            <div className="rounded-2xl glass-panel glass-tint border border-white/60 dark:border-slate-800/60 shadow-2xl p-3 w-64">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-slate-300 mb-2">
                Operações
              </p>
              <div className="space-y-2">
                <button
                  className="w-full text-left rounded-xl bg-white/70 dark:bg-slate-900/70 border border-white/60 dark:border-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-[#009DA8]/60 hover:text-[#009DA8]"
                  onClick={() => {
                    setShowOperacoesMenu(false);
                    router.push('/compras');
                  }}
                >
                  Compras
                </button>
                <button
                  className="w-full text-left rounded-xl bg-white/70 dark:bg-slate-900/70 border border-white/60 dark:border-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-[#009DA8]/60 hover:text-[#009DA8]"
                  onClick={() => {
                    setShowOperacoesMenu(false);
                    router.push('/embalagens');
                  }}
                >
                  Embalagens
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {showFinanceiroMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowFinanceiroMenu(false)} />
          <div
            className="fixed z-50 left-20"
            style={{
              top: `calc(8rem + ${DESKTOP_NAV_ITEMS.findIndex(i => i.href === '/financeiro') * (22 + 36)}px + 11px)`,
              transform: 'translateY(-50%)'
            }}
          >
            <div className="rounded-2xl glass-panel glass-tint border border-white/60 dark:border-slate-800/60 shadow-2xl p-3 w-64">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-slate-300 mb-2">
                Escolha a opção
              </p>
              <div className="space-y-2">
                <button
                  className="w-full text-left rounded-xl bg-white/70 dark:bg-slate-900/70 border border-white/60 dark:border-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-[#009DA8]/60 hover:text-[#009DA8]"
                  onClick={() => {
                    setShowFinanceiroMenu(false);
                    router.push('/financeiro/fluxo-caixa');
                  }}
                >
                  <span className="flex items-center justify-between">
                    Fluxo de Caixa
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                      Novo
                    </span>
                  </span>
                </button>
                <button
                  className="w-full text-left rounded-xl bg-white/70 dark:bg-slate-900/70 border border-white/60 dark:border-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-[#009DA8]/60 hover:text-[#009DA8]"
                  onClick={() => {
                    setShowFinanceiroMenu(false);
                    router.push('/financeiro/dre');
                  }}
                >
                  DRE
                </button>
              </div>
            </div>
          </div>
        </>
      )}


      {/* Mobile drawer */}
      <aside
        className={`lg:hidden fixed left-0 top-0 h-full z-50 w-[86vw] max-w-sm transition-all duration-300 ease-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
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
              {/* Dashboard - link direto */}
              <Link
                href="/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`group relative flex items-center gap-3 px-3 py-3 rounded-2xl transition-all duration-200 ${pathname === '/dashboard'
                  ? 'bg-gradient-to-r from-[#009DA8]/15 via-[#00B5C3]/10 to-transparent text-[#009DA8] dark:text-[#00B5C3]'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 hover:text-slate-900 dark:hover:bg-slate-800/60'
                  }`}
              >
                {pathname === '/dashboard' && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-[#009DA8] to-[#00B5C3] rounded-r-full" />
                )}
                <LayoutDashboard className={`w-5 h-5 flex-shrink-0 ${pathname === '/dashboard' ? 'scale-110' : 'group-hover:scale-110'} transition-transform duration-200`} />
                <span className="font-medium text-sm whitespace-nowrap">Dashboard</span>
              </Link>

              {/* Vendas - seção */}
              <div>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Vendas
                </div>
                <div className="space-y-1 ml-4">
                  <Link href="/pedidos" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${pathname.startsWith('/pedidos') ? 'bg-accent/10 text-accent font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'}`}>
                    <ShoppingBag className="w-4 h-4" />
                    Pedidos
                  </Link>
                  <Link href="/produtos" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${pathname.startsWith('/produtos') ? 'bg-accent/10 text-accent font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'}`}>
                    <Package className="w-4 h-4" />
                    Produtos
                  </Link>
                  <Link href="/clientes" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${pathname.startsWith('/clientes') ? 'bg-accent/10 text-accent font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'}`}>
                    <Users className="w-4 h-4" />
                    Clientes
                  </Link>
                </div>
              </div>

              {/* Financeiro - seção */}
              <div>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Financeiro
                </div>
                <div className="space-y-1 ml-4">
                  <Link href="/financeiro/fluxo-caixa" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${pathname.startsWith('/financeiro/fluxo-caixa') ? 'bg-accent/10 text-accent font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'}`}>
                    <Wallet className="w-4 h-4" />
                    <span className="flex-1">Fluxo de Caixa</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Novo</span>
                  </Link>
                  <Link href="/financeiro/dre" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${pathname.startsWith('/financeiro/dre') ? 'bg-accent/10 text-accent font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'}`}>
                    <FileText className="w-4 h-4" />
                    DRE
                  </Link>
                </div>
              </div>

              {/* Operações - seção */}
              <div>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Operações
                </div>
                <div className="space-y-1 ml-4">
                  <Link href="/compras" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${pathname.startsWith('/compras') ? 'bg-accent/10 text-accent font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'}`}>
                    <ShoppingCart className="w-4 h-4" />
                    Compras
                  </Link>
                  <Link href="/embalagens" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${pathname.startsWith('/embalagens') ? 'bg-accent/10 text-accent font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'}`}>
                    <Box className="w-4 h-4" />
                    Embalagens
                  </Link>
                </div>
              </div>

              {/* Marketplaces - seção */}
              <div>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Marketplaces
                </div>
                <div className="space-y-1 ml-4">
                  <Link href="/marketplaces/mercado-livre" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${pathname.startsWith('/marketplaces/mercado-livre') ? 'bg-accent/10 text-accent font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'}`}>
                    <Store className="w-4 h-4" />
                    Mercado Livre
                  </Link>
                  <Link href="/marketplaces/shopee" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${pathname.startsWith('/marketplaces/shopee') ? 'bg-accent/10 text-accent font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'}`}>
                    <Store className="w-4 h-4" />
                    Shopee
                  </Link>
                  <Link href="/marketplaces/magalu" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${pathname.startsWith('/marketplaces/magalu') ? 'bg-accent/10 text-accent font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'}`}>
                    <Store className="w-4 h-4" />
                    Magalu
                  </Link>
                </div>
              </div>

              {/* Relatórios - seção */}
              <div>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Relatórios
                </div>
                <div className="space-y-1 ml-4">
                  <Link href="/relatorios/vendas-mensais" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${pathname.startsWith('/relatorios/vendas-mensais') ? 'bg-accent/10 text-accent font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'}`}>
                    <FileText className="w-4 h-4" />
                    Vendas Mensais
                  </Link>
                  <Link href="/relatorios/vinculos" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${pathname.startsWith('/relatorios/vinculos') ? 'bg-accent/10 text-accent font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'}`}>
                    <FileText className="w-4 h-4" />
                    Vínculos
                  </Link>
                </div>
              </div>

              {/* Configurações - link direto */}
              <Link
                href="/configuracoes"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`group relative flex items-center gap-3 px-3 py-3 rounded-2xl transition-all duration-200 ${pathname.startsWith('/configuracoes')
                  ? 'bg-gradient-to-r from-[#009DA8]/15 via-[#00B5C3]/10 to-transparent text-[#009DA8] dark:text-[#00B5C3]'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 hover:text-slate-900 dark:hover:bg-slate-800/60'
                  }`}
              >
                {pathname.startsWith('/configuracoes') && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-[#009DA8] to-[#00B5C3] rounded-r-full" />
                )}
                <Settings className={`w-5 h-5 flex-shrink-0 ${pathname.startsWith('/configuracoes') ? 'scale-110' : 'group-hover:scale-110'} transition-transform duration-200`} />
                <span className="font-medium text-sm whitespace-nowrap">Configurações</span>
              </Link>
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
      <main className="flex-1 min-w-0 transition-all duration-300 ml-0 lg:ml-[4.5rem]">
        <div className="w-full max-w-[1600px] mx-auto relative z-10">
          <div className="relative min-h-screen px-4 sm:px-6 lg:px-12 pt-20 pb-28 lg:pt-8 lg:pb-10">
            <div className="pointer-events-none fixed inset-0 overflow-hidden flex justify-center">
              <div className="relative w-full max-w-[1600px] h-full">
                <div className="absolute -top-20 left-20 h-64 w-64 rounded-full bg-[#c7d7ff] blur-[140px] opacity-70" />
                <div className="absolute top-20 right-10 h-72 w-72 rounded-full bg-[#ffd6ff] blur-[160px] opacity-60" />
                <div className="absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-[#d1fff0] blur-[150px] opacity-50" />
              </div>
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
            onItemHover={handleMobileNavHover}
            onMarketplaceHover={() => setShowMarketplaceMenu(true)}
            items={MOBILE_GLASS_ITEMS}
          />
        </div>
      </nav>
    </div>
  );
}
