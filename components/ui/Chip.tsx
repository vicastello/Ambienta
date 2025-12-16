import React from 'react';
import { X } from 'lucide-react';

export interface ChipProps {
    /** Se o chip está ativo/selecionado */
    active?: boolean;
    /** Callback ao clicar no chip */
    onClick?: () => void;
    /** Callback ao remover o chip (mostra botão X) */
    onRemove?: () => void;
    /** Conteúdo do chip */
    children: React.ReactNode;
    /** Classes CSS adicionais */
    className?: string;
    /** Ícone à esquerda */
    icon?: React.ReactNode;
    /** Se o chip está desabilitado */
    disabled?: boolean;
    /** Tamanho do chip */
    size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
    sm: 'px-2.5 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
    lg: 'px-4 py-2 text-base gap-2',
};

const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
};

/**
 * Componente Chip minimalista para filtros, tags e seleção.
 * Redesenhado com cores Ambienta (verde #009CA6)
 * 
 * @example
 * ```tsx
 * <Chip active onClick={() => console.log('clicked')}>
 *   Ativos
 * </Chip>
 * ```
 */
export function Chip({
    active = false,
    onClick,
    onRemove,
    children,
    className = '',
    icon,
    disabled = false,
    size = 'md',
}: ChipProps) {
    const isInteractive = !disabled && (onClick || onRemove);

    const baseClasses = `
    inline-flex items-center font-medium rounded-full
    transition-all duration-200
    ${sizeClasses[size]}
  `;

    // Redesign minimalista: Inactive (cinza) / Active (verde Ambienta)
    const stateClasses = active
        ? 'bg-[#009CA6] text-white shadow-sm hover:bg-[#007982]'
        : 'bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700';

    const interactiveClasses = isInteractive && !disabled
        ? 'cursor-pointer active:scale-95'
        : '';

    const disabledClasses = disabled
        ? 'opacity-50 cursor-not-allowed'
        : '';

    return (
        <span
            className={`
        ${baseClasses}
        ${stateClasses}
        ${interactiveClasses}
        ${disabledClasses}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
            onClick={!disabled && onClick ? onClick : undefined}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick && !disabled ? 0 : undefined}
            onKeyDown={onClick && !disabled ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            } : undefined}
        >
            {icon && (
                <span className={iconSizes[size]}>
                    {icon}
                </span>
            )}

            {children}

            {onRemove && !disabled && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    className={`
            ml-1 hover:bg-white/20 rounded-full p-0.5
            transition-colors
            ${iconSizes[size]}
          `.trim().replace(/\s+/g, ' ')}
                    aria-label="Remover"
                >
                    <X className="w-full h-full" />
                </button>
            )}
        </span>
    );
}

/**
 * Grupo de chips para facilitar layout de múltiplos chips
 */
export interface ChipGroupProps {
    children: React.ReactNode;
    className?: string;
}

export function ChipGroup({ children, className = '' }: ChipGroupProps) {
    return (
        <div className={`flex flex-wrap gap-2 ${className}`.trim()}>
            {children}
        </div>
    );
}

/**
 * Chip de filtro com contador
 */
export interface FilterChipProps extends Omit<ChipProps, 'children'> {
    label: string;
    count?: number;
}

export function FilterChip({ label, count, ...props }: FilterChipProps) {
    return (
        <Chip {...props}>
            <span>{label}</span>
            {count !== undefined && count > 0 && (
                <span className={`
          ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold
          ${props.active
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }
        `.trim().replace(/\s+/g, ' ')}>
                    {count > 99 ? '99+' : count}
                </span>
            )}
        </Chip>
    );
}
