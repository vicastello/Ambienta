'use client';

import { ArrowUpCircle, AlertCircle, Clock, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';

interface ReceivablesSummaryProps {
    summary: {
        recebido: number;
        pendente: number;
        atrasado: number;
        total: number;
    } | null;
    loading?: boolean;
}

const formatBRL = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

export function ReceivablesSummary({ summary, loading }: ReceivablesSummaryProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleCardClick = (status: string | null) => {
        const params = new URLSearchParams(searchParams.toString());
        if (status) {
            params.set('status', status);
        } else {
            params.delete('status');
        }
        params.delete('page'); // Reset to first page
        router.push(`?${params.toString()}`);
    };

    if (loading || !summary) {
        return (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-32 rounded-[28px] glass-panel glass-tint border border-white/40 dark:border-white/10 animate-pulse bg-white/5" />
                ))}
            </div>
        );
    }

    const currentStatus = searchParams.get('status');

    const cards = [
        {
            label: 'Total no Período',
            value: summary.total,
            icon: Wallet,
            iconColor: 'text-slate-500',
            bgGradient: 'from-slate-500/10 to-slate-600/5',
            borderColor: 'border-slate-300/50 dark:border-slate-500/30',
            valueColor: 'text-slate-700 dark:text-slate-200',
            subtext: 'Soma de todos os pedidos',
            filterValue: null,
        },
        {
            label: 'Recebido',
            value: summary.recebido,
            icon: ArrowUpCircle,
            iconColor: 'text-emerald-500',
            bgGradient: 'from-emerald-500/15 to-emerald-600/5',
            borderColor: 'border-emerald-300/50 dark:border-emerald-500/30',
            valueColor: 'text-emerald-600 dark:text-emerald-400',
            subtext: 'Pagamentos confirmados',
            filterValue: 'pago',
        },
        {
            label: 'Pendente',
            value: summary.pendente,
            icon: Clock,
            iconColor: 'text-amber-500',
            bgGradient: 'from-amber-500/15 to-amber-600/5',
            borderColor: 'border-amber-300/50 dark:border-amber-500/30',
            valueColor: 'text-amber-600 dark:text-amber-400',
            subtext: 'Aguardando pagamento',
            filterValue: 'pendente',
        },
        {
            label: 'Atrasado',
            value: summary.atrasado,
            icon: AlertCircle,
            iconColor: 'text-rose-500',
            bgGradient: 'from-rose-500/15 to-rose-600/5',
            borderColor: 'border-rose-300/50 dark:border-rose-500/30',
            valueColor: 'text-rose-600 dark:text-rose-400',
            subtext: 'Vencimento excedido',
            filterValue: 'atrasado',
        }
    ];

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card, idx) => {
                const Icon = card.icon;
                const isActive = currentStatus === card.filterValue || (currentStatus === null && card.filterValue === null);
                return (
                    <button
                        key={idx}
                        onClick={() => handleCardClick(card.filterValue)}
                        className={cn(
                            "rounded-[28px] p-5 flex flex-col justify-between text-left transition-all duration-200",
                            "bg-gradient-to-br border",
                            card.bgGradient,
                            card.borderColor,
                            "hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]",
                            isActive && "ring-2 ring-offset-2 ring-offset-background",
                            isActive && card.filterValue === 'pago' && "ring-emerald-500",
                            isActive && card.filterValue === 'pendente' && "ring-amber-500",
                            isActive && card.filterValue === 'atrasado' && "ring-rose-500",
                            isActive && card.filterValue === null && "ring-slate-400",
                        )}
                    >
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs uppercase tracking-wide text-muted font-medium">{card.label}</p>
                                <Icon className={cn("w-5 h-5", card.iconColor)} />
                            </div>
                            <p className={cn("text-2xl font-bold mb-1", card.valueColor)}>
                                {formatBRL(card.value)}
                            </p>
                        </div>
                        <p className="text-xs text-muted/80 mt-2">
                            {card.subtext}
                        </p>
                    </button>
                );
            })}
        </div>
    );
}

