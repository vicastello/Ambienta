import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface PageHeaderProps {
    /** Título principal da página */
    title: string;
    /** Descrição opcional */
    description?: string;
    /** Ícone opcional */
    icon?: LucideIcon;
    /** Badge ou status opcional */
    badge?: React.ReactNode;
    /** Ações do lado direito (botões, etc) */
    actions?: React.ReactNode;
    /** Classes CSS adicionais */
    className?: string;
}

/**
 * Componente PageHeader padronizado para todas as páginas.
 * Estilo minimalista Ambienta.
 * 
 * @example
 * ```tsx
 * <PageHeader
 *   title="Produtos"
 *   description="123 produtos cadastrados"
 *   icon={Package}
 *   badge={<Badge variant="brand">Ativo</Badge>}
 *   actions={
 *     <>
 *       <Button variant="secondary">Exportar</Button>
 *       <Button variant="primary">Sincronizar</Button>
 *     </>
 *   }
 * />
 * ```
 */
export function PageHeader({
    title,
    description,
    icon: Icon,
    badge,
    actions,
    className = '',
}: PageHeaderProps) {
    return (
        <header
            className={`
        flex flex-col sm:flex-row sm:items-center sm:justify-between
        gap-4 mb-6
        ${className}
      `.trim().replace(/\s+/g, ' ')}
        >
            {/* Lado esquerdo: Ícone, Título, Badge, Descrição */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                    {Icon && (
                        <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-[#009CA6]/10 dark:bg-[#009CA6]/20 flex items-center justify-center">
                            <Icon className="w-5 h-5 text-[#009CA6]" />
                        </div>
                    )}

                    <h1 className="text-3xl sm:text-4xl font-semibold text-main truncate">
                        {title}
                    </h1>

                    {badge && <div className="flex-shrink-0">{badge}</div>}
                </div>

                {description && (
                    <p className="text-sm text-muted pl-13">
                        {description}
                    </p>
                )}
            </div>

            {/* Lado direito: Ações */}
            {actions && (
                <div className="flex flex-wrap gap-3 sm:flex-shrink-0">
                    {actions}
                </div>
            )}
        </header>
    );
}
