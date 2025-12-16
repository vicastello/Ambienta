import React from 'react';

export type BadgeVariant =
    | 'brand'
    | 'neutral'
    | 'error'
    | 'warning';

export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
    /** Variante de cor do badge */
    variant?: BadgeVariant;
    /** Tamanho do badge */
    size?: BadgeSize;
    /** Conteúdo do badge */
    children: React.ReactNode;
    /** Classes CSS adicionais */
    className?: string;
    /** Se o badge tem ícone */
    icon?: React.ReactNode;
    /** Se o badge é "outlined" (apenas borda) */
    outline?: boolean;
}

// Redesign minimalista - apenas cores essenciais
const variantClasses: Record<BadgeVariant, string> = {
    brand: 'bg-[#009CA6]/10 text-[#009CA6] dark:bg-[#009CA6]/20 dark:text-[#00B5C3]',
    neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300',
    error: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
};

const variantOutlineClasses: Record<BadgeVariant, string> = {
    brand: 'border-[#009CA6] text-[#009CA6] dark:border-[#00B5C3] dark:text-[#00B5C3]',
    neutral: 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-400',
    error: 'border-rose-300 text-rose-700 dark:border-rose-500/40 dark:text-rose-400',
    warning: 'border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-400',
};

const sizeClasses: Record<BadgeSize, { container: string; text: string; icon: string }> = {
    sm: {
        container: 'px-2 py-0.5 gap-1',
        text: 'text-xs',
        icon: 'w-3 h-3',
    },
    md: {
        container: 'px-2.5 py-1 gap-1.5',
        text: 'text-sm',
        icon: 'w-3.5 h-3.5',
    },
    lg: {
        container: 'px-3 py-1.5 gap-2',
        text: 'text-base',
        icon: 'w-4 h-4',
    },
};

/**
 * Componente Badge minimalista para exibição de status e tags.
 * Redesenhado com apenas 4 variants essenciais.
 * 
 * @example
 * ```tsx
 * <Badge variant="brand">Ativo</Badge>
 * <Badge variant="neutral" size="sm">123 itens</Badge>
 * <Badge variant="error" icon={<AlertIcon />}>Crítico</Badge>
 * ```
 */
export function Badge({
    variant = 'neutral',
    size = 'md',
    children,
    className = '',
    icon,
    outline = false,
}: BadgeProps) {
    const colorClasses = outline ? variantOutlineClasses[variant] : variantClasses[variant];
    const sizeConfig = sizeClasses[size];

    const outlineClasses = outline ? 'bg-transparent border' : '';

    return (
        <span
            className={`
        inline-flex items-center font-medium rounded-lg transition-colors
        ${sizeConfig.container}
        ${sizeConfig.text}
        ${colorClasses}
        ${outlineClasses}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
        >
            {icon && (
                <span className={sizeConfig.icon}>
                    {icon}
                </span>
            )}
            {children}
        </span>
    );
}

/**
 * Badge específico para indicadores numéricos (dot badge)
 */
export interface DotBadgeProps {
    /** Valor numérico a exibir */
    count?: number;
    /** Variante de cor */
    variant?: BadgeVariant;
    /** Mostrar apenas o dot sem número */
    dotOnly?: boolean;
    /** Classes CSS adicionais */
    className?: string;
}

export function DotBadge({
    count,
    variant = 'error',
    dotOnly = false,
    className = '',
}: DotBadgeProps) {
    const colorClasses = variantClasses[variant];

    if (dotOnly) {
        return (
            <span
                className={`
          inline-block w-2 h-2 rounded-full
          ${colorClasses}
          ${className}
        `.trim().replace(/\s+/g, ' ')}
            />
        );
    }

    return (
        <span
            className={`
        inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5
        rounded-full text-xs font-semibold
        ${colorClasses}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
        >
            {count !== undefined && count > 99 ? '99+' : count}
        </span>
    );
}
