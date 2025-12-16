'use client';

import React from 'react';
import { AlertTriangle, TrendingDown, Package, ChevronDown, ChevronRight } from 'lucide-react';
import type { ProdutoDerivado } from '../types';

type Alert = {
    id: string;
    type: 'critical' | 'warning' | 'info';
    icon: React.ReactNode;
    title: string;
    message: string;
    count: number;
};

type AlertsPanelProps = {
    produtos: ProdutoDerivado[];
};

const ALERT_STYLES = {
    critical: 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300',
    warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300',
    info: 'bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-500/10 dark:border-sky-500/30 dark:text-sky-300',
};

const ICON_STYLES = {
    critical: 'text-rose-500 dark:text-rose-400',
    warning: 'text-amber-500 dark:text-amber-400',
    info: 'text-sky-500 dark:text-sky-400',
};

export function AlertsPanel({ produtos }: AlertsPanelProps) {
    const [isCollapsed, setIsCollapsed] = React.useState(false);

    const alerts = React.useMemo<Alert[]>(() => {
        const result: Alert[] = [];

        // 1. Produtos Curva A com ruptura iminente (≤7 dias)
        const produtosACriticos = produtos.filter(
            (p) => p.curvaABC === 'A' && p.diasAteRuptura !== null && p.diasAteRuptura <= 7
        );
        if (produtosACriticos.length > 0) {
            result.push({
                id: 'a-critical',
                type: 'critical',
                icon: <AlertTriangle className="w-4 h-4" />,
                title: 'Produtos A em risco',
                message: `${produtosACriticos.length} produto${produtosACriticos.length > 1 ? 's' : ''} de alta rotatividade com ruptura em até 7 dias`,
                count: produtosACriticos.length,
            });
        }

        // 2. Produtos com ruptura iminente (≤3 dias) - qualquer curva
        const rupturaIminente = produtos.filter(
            (p) => p.diasAteRuptura !== null && p.diasAteRuptura <= 3 && p.curvaABC !== 'A'
        );
        if (rupturaIminente.length > 0) {
            result.push({
                id: 'ruptura-iminente',
                type: 'critical',
                icon: <TrendingDown className="w-4 h-4" />,
                title: 'Ruptura iminente',
                message: `${rupturaIminente.length} produto${rupturaIminente.length > 1 ? 's' : ''} podem romper estoque em até 3 dias`,
                count: rupturaIminente.length,
            });
        }

        // 3. Alertas de embalagem
        const alertaEmbalagem = produtos.filter((p) => p.alerta_embalagem);
        if (alertaEmbalagem.length > 0) {
            result.push({
                id: 'alerta-embalagem',
                type: 'warning',
                icon: <Package className="w-4 h-4" />,
                title: 'Ajuste de embalagem',
                message: `${alertaEmbalagem.length} produto${alertaEmbalagem.length > 1 ? 's' : ''} com quantidade sugerida menor que a embalagem`,
                count: alertaEmbalagem.length,
            });
        }

        return result;
    }, [produtos]);

    if (alerts.length === 0) return null;

    const totalAlerts = alerts.reduce((acc, a) => acc + a.count, 0);
    const criticalCount = alerts.filter(a => a.type === 'critical').reduce((acc, a) => acc + a.count, 0);

    return (
        <div className="rounded-2xl border border-white/50 dark:border-white/10 bg-white/30 dark:bg-white/5 overflow-hidden">
            {/* Header colapsável */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/30 dark:hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Alertas
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${criticalCount > 0
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                        }`}>
                        {totalAlerts}
                    </span>
                </div>
                {isCollapsed && (
                    <span className="text-xs text-slate-500">
                        {alerts.length} tipo{alerts.length > 1 ? 's' : ''} de alerta
                    </span>
                )}
            </button>

            {/* Conteúdo */}
            {!isCollapsed && (
                <div className="px-4 pb-3 pt-3 flex flex-wrap gap-3">
                    {alerts.map((alert) => (
                        <div
                            key={alert.id}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border ${ALERT_STYLES[alert.type]}`}
                        >
                            <span className={ICON_STYLES[alert.type]}>{alert.icon}</span>
                            <div className="flex flex-col">
                                <span className="text-xs font-semibold">{alert.title}</span>
                                <span className="text-[11px] opacity-80">{alert.message}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
