import { ArrowUpCircle, AlertCircle, Clock, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils'; // Assuming cn was created earlier

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
    if (loading || !summary) {
        return (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-32 rounded-[28px] glass-panel glass-tint border border-white/40 dark:border-white/10 animate-pulse bg-white/5" />
                ))}
            </div>
        );
    }

    const cards = [
        {
            label: 'Total no Período',
            value: summary.total,
            icon: Wallet,
            color: 'text-main',
            subtext: 'Soma de todos os pedidos listados'
        },
        {
            label: 'Recebido',
            value: summary.recebido,
            icon: ArrowUpCircle,
            color: 'text-emerald-500',
            subtext: 'Pagamentos já identificados'
        },
        {
            label: 'Pendente',
            value: summary.pendente,
            icon: Clock,
            color: 'text-amber-500',
            subtext: 'Aguardando pagamento (no prazo)'
        },
        {
            label: 'Atrasado',
            value: summary.atrasado,
            icon: AlertCircle,
            color: 'text-rose-500',
            subtext: 'Vencimento estimado excedido'
        }
    ];

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card, idx) => {
                const Icon = card.icon;
                return (
                    <div key={idx} className="rounded-[28px] glass-panel glass-tint border border-white/40 dark:border-white/10 p-5 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs uppercase tracking-wide text-muted font-medium">{card.label}</p>
                                <Icon className={cn("w-5 h-5", card.color)} />
                            </div>
                            <p className={cn("text-2xl font-bold mb-1", card.color)}>
                                {formatBRL(card.value)}
                            </p>
                        </div>
                        <p className="text-xs text-muted/80 mt-2">
                            {card.subtext}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}
