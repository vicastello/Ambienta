import React from 'react';

interface SkeletonProps {
    /** Classe CSS adicional */
    className?: string;
    /** Variante do skeleton */
    variant?: 'text' | 'circular' | 'rectangular';
    /** Largura (usado com circular/rectangular) */
    width?: string | number;
    /** Altura (usado com circular/rectangular) */
    height?: string | number;
}

export function Skeleton({
    className = '',
    variant = 'text',
    width,
    height,
}: SkeletonProps) {
    const baseClasses = 'animate-pulse bg-slate-200/60 dark:bg-slate-700/60';

    const variantClasses = {
        text: 'h-4 rounded-full',
        circular: 'rounded-full',
        rectangular: 'rounded-lg',
    };

    const style: React.CSSProperties = {};
    if (width) style.width = typeof width === 'number' ? `${width}px` : width;
    if (height) style.height = typeof height === 'number' ? `${height}px` : height;

    return (
        <div
            className={`${baseClasses} ${variantClasses[variant]} ${className}`}
            style={style}
        />
    );
}

/** Skeleton para card de métrica */
export function MetricSkeleton() {
    return (
        <div className="rounded-[28px] glass-panel glass-tint p-5 animate-pulse">
            <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-3 w-24 rounded-full" />
                <Skeleton variant="circular" width={20} height={20} />
            </div>
            <Skeleton className="h-8 w-32 rounded-lg mb-2" />
            <Skeleton className="h-2 w-20 rounded-full" />
        </div>
    );
}

/** Skeleton para gráfico */
export function ChartSkeleton({ height = 300 }: { height?: number }) {
    return (
        <div className="space-y-4 animate-pulse" style={{ height: `${height}px` }}>
            <div className="flex items-end justify-between h-full gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div
                        key={i}
                        className="flex-1 bg-slate-200/60 dark:bg-slate-700/60 rounded-t-lg"
                        style={{
                            height: `${30 + Math.random() * 70}%`,
                            animationDelay: `${i * 0.05}s`,
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

/** Skeleton para tabela */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="space-y-3">
            {Array.from({ length: rows }).map((_, i) => (
                <div
                    key={i}
                    className="flex items-center gap-4 p-4 rounded-2xl glass-row animate-pulse"
                    style={{ animationDelay: `${i * 0.1}s` }}
                >
                    <Skeleton variant="circular" width={40} height={40} />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                </div>
            ))}
        </div>
    );
}
