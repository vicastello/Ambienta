'use client';

import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { ConfigValidationResult } from '@/lib/validations/marketplace-config';

interface ValidationErrorsProps {
    validationResults: Record<string, ConfigValidationResult>;
    className?: string;
}

export function ValidationErrors({ validationResults, className = '' }: ValidationErrorsProps) {
    const hasErrors = Object.values(validationResults).some(r => r.errors.length > 0);
    const hasWarnings = Object.values(validationResults).some(r => r.warnings.length > 0);

    if (!hasErrors && !hasWarnings) {
        return null;
    }

    const getMarketplaceName = (key: string) => {
        const names: Record<string, string> = {
            shopee: 'Shopee',
            mercado_livre: 'Mercado Livre',
            magalu: 'Magalu',
        };
        return names[key] || key;
    };

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Errors */}
            {hasErrors && (
                <div className="glass-card rounded-xl p-4 border-2 border-red-500/30 bg-red-500/10">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-bold text-red-700 dark:text-red-300 mb-2">
                                ❌ Erros de Validação
                            </p>
                            <p className="text-xs text-red-600 dark:text-red-400 mb-3">
                                Corrija os erros abaixo antes de salvar:
                            </p>
                            <div className="space-y-2">
                                {Object.entries(validationResults).map(([marketplace, result]) => {
                                    if (result.errors.length === 0) return null;

                                    return (
                                        <div key={marketplace} className="space-y-1">
                                            <p className="text-xs font-bold text-red-700 dark:text-red-300">
                                                {getMarketplaceName(marketplace)}:
                                            </p>
                                            <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 ml-3">
                                                {result.errors.map((error, idx) => (
                                                    <li key={idx} className="flex items-start gap-2">
                                                        <span className="text-red-500 mt-0.5">•</span>
                                                        <span>{error}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Warnings */}
            {hasWarnings && (
                <div className="glass-card rounded-xl p-4 border border-yellow-500/30 bg-yellow-500/10">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-bold text-yellow-700 dark:text-yellow-300 mb-2">
                                ⚠️ Avisos
                            </p>
                            <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-3">
                                Valores suspeitos detectados. Você pode continuar, mas revise:
                            </p>
                            <div className="space-y-2">
                                {Object.entries(validationResults).map(([marketplace, result]) => {
                                    if (result.warnings.length === 0) return null;

                                    return (
                                        <div key={marketplace} className="space-y-1">
                                            <p className="text-xs font-bold text-yellow-700 dark:text-yellow-300">
                                                {getMarketplaceName(marketplace)}:
                                            </p>
                                            <ul className="text-xs text-yellow-600 dark:text-yellow-400 space-y-1 ml-3">
                                                {result.warnings.map((warning, idx) => (
                                                    <li key={idx} className="flex items-start gap-2">
                                                        <span className="text-yellow-500 mt-0.5">•</span>
                                                        <span>{warning}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Success (all valid) */}
            {!hasErrors && !hasWarnings && (
                <div className="glass-card rounded-xl p-4 border border-green-500/30 bg-green-500/10">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <p className="text-sm font-medium text-green-700 dark:text-green-300">
                            ✓ Todas as configurações estão válidas
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Validation badge para exibir contador de erros
 */
interface ValidationBadgeProps {
    validationResults: Record<string, ConfigValidationResult>;
}

export function ValidationBadge({ validationResults }: ValidationBadgeProps) {
    const totalErrors = Object.values(validationResults).reduce(
        (sum, result) => sum + result.errors.length,
        0
    );
    const totalWarnings = Object.values(validationResults).reduce(
        (sum, result) => sum + result.warnings.length,
        0
    );

    if (totalErrors === 0 && totalWarnings === 0) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-700 dark:text-green-300 text-xs font-bold rounded-full">
                <CheckCircle className="w-3 h-3" />
                Válido
            </span>
        );
    }

    if (totalErrors > 0) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-700 dark:text-red-300 text-xs font-bold rounded-full">
                <AlertCircle className="w-3 h-3" />
                {totalErrors} erro{totalErrors !== 1 ? 's' : ''}
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 text-xs font-bold rounded-full">
            <AlertTriangle className="w-3 h-3" />
            {totalWarnings} aviso{totalWarnings !== 1 ? 's' : ''}
        </span>
    );
}
