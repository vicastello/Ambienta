import React, { forwardRef } from 'react';
import { Search, X } from 'lucide-react';

export type InputVariant = 'default' | 'glass' | 'minimal';
export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
    /** Variante visual do input */
    variant?: InputVariant;
    /** Tamanho do input */
    size?: InputSize;
    /** Mensagem de erro */
    error?: string;
    /** Label do input */
    label?: string;
    /** Ícone à esquerda */
    leftIcon?: React.ReactNode;
    /** Ícone à direita */
    rightIcon?: React.ReactNode;
    /** Se mostra botão de limpar */
    clearable?: boolean;
    /** Callback ao limpar */
    onClear?: () => void;
    /** Container className */
    containerClassName?: string;
}

const variantClasses: Record<InputVariant, string> = {
    default: 'app-input',
    glass: 'bg-white/30 dark:bg-slate-900/30 border border-white/20 dark:border-slate-700/40 backdrop-blur-lg',
    minimal: 'bg-transparent border-b-2 border-slate-200 dark:border-slate-700 rounded-none px-0',
};

const sizeClasses: Record<InputSize, { input: string; icon: string }> = {
    sm: {
        input: 'h-9 px-3 text-sm',
        icon: 'w-4 h-4',
    },
    md: {
        input: 'h-11 px-4 text-base',
        icon: 'w-5 h-5',
    },
    lg: {
        input: 'h-13 px-5 text-lg',
        icon: 'w-6 h-6',
    },
};

/**
 * Componente Input padronizado com suporte a variantes, ícones e validação.
 * 
 * @example
 * ```tsx
 * <Input 
 *   label="E-mail"
 *   type="email" 
 *   placeholder="seu@email.com"
 *   error="E-mail inválido"
 * />
 * 
 * <Input 
 *   variant="glass"
 *   leftIcon={<Search />}
 *   placeholder="Buscar..."
 *   clearable
 * />
 * ```
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
    (
        {
            variant = 'default',
            size = 'md',
            error,
            label,
            leftIcon,
            rightIcon,
            clearable = false,
            onClear,
            className = '',
            containerClassName = '',
            ...props
        },
        ref
    ) => {
        const variantClass = variantClasses[variant];
        const sizeConfig = sizeClasses[size];

        const hasLeftIcon = !!leftIcon;
        const hasRightIcon = !!rightIcon || (clearable && props.value);

        const paddingClass = hasLeftIcon
            ? 'pl-10'
            : hasRightIcon
                ? 'pr-10'
                : '';

        const inputClasses = `
      ${variantClass}
      ${sizeConfig.input}
      ${paddingClass}
      ${error ? 'border-red-500 dark:border-red-400' : ''}
      ${className}
    `.trim().replace(/\s+/g, ' ');

        return (
            <div className={`relative ${containerClassName}`.trim()}>
                {label && (
                    <label className="block text-sm font-medium text-main mb-2">
                        {label}
                    </label>
                )}

                <div className="relative">
                    {leftIcon && (
                        <div className={`
              absolute left-3 top-1/2 -translate-y-1/2 
              text-muted pointer-events-none
              ${sizeConfig.icon}
            `.trim().replace(/\s+/g, ' ')}>
                            {leftIcon}
                        </div>
                    )}

                    <input
                        ref={ref}
                        className={inputClasses}
                        {...props}
                    />

                    {clearable && props.value && onClear && (
                        <button
                            type="button"
                            onClick={onClear}
                            className={`
                absolute right-3 top-1/2 -translate-y-1/2 
                text-muted hover:text-main transition-colors
                ${sizeConfig.icon}
              `.trim().replace(/\s+/g, ' ')}
                            aria-label="Limpar"
                        >
                            <X className="w-full h-full" />
                        </button>
                    )}

                    {rightIcon && !clearable && (
                        <div className={`
              absolute right-3 top-1/2 -translate-y-1/2 
              text-muted pointer-events-none
              ${sizeConfig.icon}
            `.trim().replace(/\s+/g, ' ')}>
                            {rightIcon}
                        </div>
                    )}
                </div>

                {error && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {error}
                    </p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';

/**
 * Input de busca com ícone de lupa
 */
export interface SearchInputProps extends Omit<InputProps, 'leftIcon' | 'type'> {
    onSearch?: (value: string) => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
    ({ onSearch, ...props }, ref) => {
        return (
            <Input
                ref={ref}
                type="search"
                leftIcon={<Search />}
                clearable
                {...props}
                onChange={(e) => {
                    props.onChange?.(e);
                    onSearch?.(e.target.value);
                }}
            />
        );
    }
);

SearchInput.displayName = 'SearchInput';
