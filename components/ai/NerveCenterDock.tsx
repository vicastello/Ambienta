'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import NerveCenter from '@/app/dashboard/components/NerveCenter';

type AiContextPayload = {
  screen?: string;
  dashboardData?: unknown;
  filters?: {
    canaisSelecionados?: string[];
    situacoesSelecionadas?: number[];
  };
};

type ScreenContextPayload = {
  screen: string;
  context: unknown;
};

const AI_COLLAPSE_KEY = 'ai_sidebar_v2:collapsed';
const AI_DASHBOARD_CONTEXT_KEY = 'ai_context_v1:dashboard';

type NerveCenterDockProps = {
  collapsed: boolean;
  onToggle: (next: boolean) => void;
};

export function NerveCenterDock({ collapsed, onToggle }: NerveCenterDockProps) {
  const pathname = usePathname();
  const [context, setContext] = useState<AiContextPayload>({});
  const [screenContext, setScreenContext] = useState<ScreenContextPayload | null>(null);

  const handleToggle = useCallback(() => {
    const next = !collapsed;
    onToggle(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(AI_COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage failures
      }
    }
  }, [collapsed, onToggle]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AiContextPayload>).detail;
      if (!detail) return;
      setContext(detail);
      try {
        window.localStorage.setItem(AI_DASHBOARD_CONTEXT_KEY, JSON.stringify(detail));
      } catch {
        // ignore storage failures
      }
    };
    window.addEventListener('ai:context', handler as EventListener);
    return () => window.removeEventListener('ai:context', handler as EventListener);
  }, []);

  const screenKey = useMemo(() => {
    if (!pathname) return 'dashboard';
    if (pathname.startsWith('/dashboard')) return 'dashboard';
    if (pathname.startsWith('/produtos')) return 'produtos';
    if (pathname.startsWith('/compras')) return 'compras';
    if (pathname.startsWith('/financeiro')) return 'financeiro';
    if (pathname.startsWith('/pedidos')) return 'pedidos';
    return 'dashboard';
  }, [pathname]);

  const screenLabel = useMemo(() => {
    switch (screenKey) {
      case 'dashboard':
        return 'Nerve Center';
      case 'produtos':
        return 'IA Estoque';
      case 'compras':
        return 'IA Compras';
      case 'financeiro':
        return 'IA Financeiro';
      case 'pedidos':
        return 'IA Pedidos';
      default:
        return 'IA Operacional';
    }
  }, [screenKey]);

  useEffect(() => {
    let active = true;
    const fetchContext = async () => {
      try {
        const res = await fetch(`/api/ai/context?screen=${screenKey}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setScreenContext({ screen: screenKey, context: data?.context ?? {} });
      } catch {
        // ignore context errors
      }
    };
    fetchContext();
    return () => {
      active = false;
    };
  }, [screenKey]);
  const resolvedScreenContext = screenContext?.screen === screenKey ? screenContext : null;

  return (
    <aside className={`ai-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="ai-sidebar-toggle">
        <button
          type="button"
          onClick={handleToggle}
          className="ai-toggle-button"
          aria-label={collapsed ? 'Expandir IA' : 'Ocultar IA'}
        >
          {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="ai-toggle-label">
          <Sparkles size={14} />
          <span>{screenLabel}</span>
        </div>
      </div>

      {!collapsed && (
        <NerveCenter
          dashboardData={context.dashboardData}
          filters={context.filters}
          screenContext={resolvedScreenContext}
          className="nerve-center--dock"
        />
      )}
    </aside>
  );
}
