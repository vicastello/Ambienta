
import React from 'react';
import { cn } from '@/lib/utils';
import { Check, Clock, AlertCircle, AlertTriangle } from 'lucide-react';

type StatusType = 'success' | 'warning' | 'error' | 'info' | 'default';

interface StatusBadgeProps {
    status: StatusType;
    label: string;
    icon?: boolean;
    className?: string;
}

const statusStyles: Record<StatusType, string> = {
    success: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
    warning: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
    error: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20',
    info: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
    default: 'bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/20',
};

const statusIcons: Record<StatusType, any> = {
    success: Check,
    warning: Clock,
    error: AlertCircle,
    info: AlertCircle,
    default: AlertTriangle,
};

export function StatusBadge({ status, label, icon = true, className }: StatusBadgeProps) {
    const Icon = statusIcons[status];

    return (
        <span className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
            statusStyles[status],
            className
        )}>
            {icon && <Icon className="w-3.5 h-3.5" />}
            {label}
        </span>
    );
}
