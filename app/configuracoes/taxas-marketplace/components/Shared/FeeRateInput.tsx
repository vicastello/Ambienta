'use client';

/**
 * Input reutilizável para taxas percentuais
 */

import { Tooltip } from '@/components/ui/Tooltip';

interface FeeRateInputProps {
    /** Valor atual (%) */
    value: number;
    /** Callback de mudança */
    onChange: (value: number) => void;
    /** Label do campo */
    label: string;
    /** Texto do tooltip (opcional) */
    tooltip?: string;
    /** Esquema de cores (para focus ring) */
    colorScheme?: 'blue' | 'emerald' | 'yellow' | 'indigo' | 'purple';
    /** Step do input */
    step?: number;
    /** Texto de ajuda abaixo do input */
    helpText?: string;
    /** Se o campo está desabilitado */
    disabled?: boolean;
    /** Erro de validação */
    error?: string;
    /** ID único para acessibilidade */
    id?: string;
}

const colorClasses = {
    blue: 'focus:ring-blue-500',
    emerald: 'focus:ring-emerald-500',
    yellow: 'focus:ring-yellow-500',
    indigo: 'focus:ring-indigo-500',
    purple: 'focus:ring-purple-500',
};

export function FeeRateInput({
    value,
    onChange,
    label,
    tooltip,
    colorScheme = 'blue',
    step = 0.1,
    helpText,
    disabled = false,
    error,
    id,
}: FeeRateInputProps) {
    const inputId = id || `fee-rate-${label.toLowerCase().replace(/\s+/g, '-')}`;

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <label
                    htmlFor={inputId}
                    className="block text-sm font-medium text-main"
                >
                    {label}
                </label>
                {tooltip && (
                    <Tooltip content={tooltip}>
                        <span className="text-muted text-xs cursor-help" aria-hidden="true">ⓘ</span>
                    </Tooltip>
                )}
            </div>

            <div className="relative max-w-[140px]">
                <input
                    id={inputId}
                    type="number"
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                    disabled={disabled}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined}
                    className={`
                        app-input app-input-compact app-input-suffix-compact
                        ${colorClasses[colorScheme]}
                        disabled:opacity-50 disabled:cursor-not-allowed
                        ${error ? 'border-red-500 focus:ring-red-500' : ''}
                    `}
                />
                <span className="app-input-addon app-input-addon-right-compact app-input-addon-compact">%</span>
            </div>

            {error && (
                <p id={`${inputId}-error`} className="text-xs text-red-600 dark:text-red-400">
                    {error}
                </p>
            )}

            {helpText && !error && (
                <p id={`${inputId}-help`} className="text-[10px] text-muted">
                    {helpText}
                </p>
            )}
        </div>
    );
}
