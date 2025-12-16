import React from 'react';

export type CardVariant = 'default' | 'glass' | 'elevated' | 'bordered';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';

export interface CardProps {
    /** Variante visual do card */
    variant?: CardVariant;
    /** Padding interno do card */
    padding?: CardPadding;
    /** Classes CSS adicionais */
    className?: string;
    /** Conteúdo do card */
    children: React.ReactNode;
    /** Callback ao clicar no card */
    onClick?: () => void;
    /** Se o card é interativo (hover/focus) */
    interactive?: boolean;
}

const variantClasses: Record<CardVariant, string> = {
    default: 'app-card',
    glass: 'glass-panel',
    elevated: 'app-card shadow-elevated',
    bordered: 'bg-white/95 dark:bg-slate-900/95 border-2 border-slate-200 dark:border-slate-700',
};

const paddingClasses: Record<CardPadding, string> = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-10',
};

/**
 * Componente Card padronizado para uso em todo o aplicativo.
 * 
 * @example
 * ```tsx
 * <Card variant="glass" padding="lg">
 *   <h2>Título</h2>
 *   <p>Conteúdo</p>
 * </Card>
 * ```
 */
export function Card({
    variant = 'default',
    padding = 'md',
    className = '',
    children,
    onClick,
    interactive = false,
}: CardProps) {
    const baseClasses = variantClasses[variant];
    const paddingClass = paddingClasses[padding];

    const interactiveClasses = interactive || onClick
        ? 'cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99]'
        : '';

    return (
        <div
            className={`${baseClasses} ${paddingClass} ${interactiveClasses} ${className}`.trim()}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={onClick ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            } : undefined}
        >
            {children}
        </div>
    );
}

/**
 * Card Header - seção de cabeçalho do card
 */
export interface CardHeaderProps {
    children: React.ReactNode;
    className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
    return (
        <div className={`mb-4 ${className}`.trim()}>
            {children}
        </div>
    );
}

/**
 * Card Title - título do card
 */
export interface CardTitleProps {
    children: React.ReactNode;
    className?: string;
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export function CardTitle({ children, className = '', as: Component = 'h3' }: CardTitleProps) {
    return (
        <Component className={`text-lg font-semibold text-main ${className}`.trim()}>
            {children}
        </Component>
    );
}

/**
 * Card Description - descrição/subtítulo do card
 */
export interface CardDescriptionProps {
    children: React.ReactNode;
    className?: string;
}

export function CardDescription({ children, className = '' }: CardDescriptionProps) {
    return (
        <p className={`text-sm text-muted ${className}`.trim()}>
            {children}
        </p>
    );
}

/**
 * Card Content - conteúdo principal do card
 */
export interface CardContentProps {
    children: React.ReactNode;
    className?: string;
}

export function CardContent({ children, className = '' }: CardContentProps) {
    return (
        <div className={className}>
            {children}
        </div>
    );
}

/**
 * Card Footer - rodapé do card
 */
export interface CardFooterProps {
    children: React.ReactNode;
    className?: string;
}

export function CardFooter({ children, className = '' }: CardFooterProps) {
    return (
        <div className={`mt-4 pt-4 border-t border-[var(--border-subtle)] ${className}`.trim()}>
            {children}
        </div>
    );
}
