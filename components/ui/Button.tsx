import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    icon?: React.ReactNode;
    iconPosition?: 'left' | 'right';
    fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            variant = 'primary',
            size = 'md',
            loading = false,
            icon,
            iconPosition = 'left',
            fullWidth = false,
            className = '',
            children,
            disabled,
            ...props
        },
        ref
    ) => {
        // Variant styles - Minimalista com apenas 2 cores
        const variantStyles = {
            primary: 'bg-[#009CA6] hover:bg-[#007982] text-white disabled:bg-[#009CA6]/40 shadow-sm hover:shadow-md',
            secondary: 'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600',
        };

        // Size styles
        const sizeStyles = {
            sm: 'px-3 py-1.5 text-xs',
            md: 'px-5 py-2.5 text-sm',
            lg: 'px-6 py-3 text-base',
        };

        // Icon size
        const iconSizes = {
            sm: 'w-3 h-3',
            md: 'w-4 h-4',
            lg: 'w-5 h-5',
        };

        const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

        const widthStyle = fullWidth ? 'w-full' : '';

        const combinedClassName = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`.trim();

        const iconElement = loading ? (
            <Loader2 className={`${iconSizes[size]} animate-spin`} />
        ) : icon ? (
            <span className={iconSizes[size]}>{icon}</span>
        ) : null;

        return (
            <button
                ref={ref}
                className={combinedClassName}
                disabled={disabled || loading}
                {...props}
            >
                {iconElement && iconPosition === 'left' && iconElement}
                {children}
                {iconElement && iconPosition === 'right' && iconElement}
            </button>
        );
    }
);

Button.displayName = 'Button';
