'use client';

/**
 * Painel de ações para salvar/resetar configurações
 */

import { Save, RotateCcw } from 'lucide-react';

interface SaveActionsPanelProps {
    /** Callback ao clicar em Salvar */
    onSave: () => void;
    /** Callback ao clicar em Resetar/Restaurar */
    onReset: () => void;
    /** Se está salvando */
    saving?: boolean;
    /** Se o salvamento está desabilitado */
    disabled?: boolean;
    /** Esquema de cores do botão principal */
    colorScheme?: 'blue' | 'yellow' | 'indigo';
    /** Texto do botão de salvar */
    saveText?: string;
    /** Texto do botão de reset */
    resetText?: string;
    /** Texto adicional explicativo */
    helpText?: string;
    /** Classes CSS adicionais */
    className?: string;
}

const buttonColorClasses = {
    blue: 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20',
    yellow: 'bg-yellow-600 hover:bg-yellow-700 shadow-yellow-500/10',
    indigo: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/10',
};

export function SaveActionsPanel({
    onSave,
    onReset,
    saving = false,
    disabled = false,
    colorScheme = 'blue',
    saveText = 'Salvar Alterações',
    resetText = 'Restaurar Padrão',
    helpText,
    className = '',
}: SaveActionsPanelProps) {
    const isDisabled = saving || disabled;

    return (
        <div className={`glass-panel glass-tint rounded-[32px] p-6 border border-white/30 dark:border-white/10 h-full flex flex-col ${className}`}>
            {helpText && (
                <div className="flex-1 mb-6">
                    <h3 className="text-sm font-bold text-main mb-4">Ações</h3>
                    <p className="text-xs text-muted leading-relaxed">
                        {helpText}
                    </p>
                </div>
            )}

            <div className="flex flex-col gap-3 mt-auto">
                <button
                    onClick={onSave}
                    disabled={isDisabled}
                    className={`
                        w-full py-3 px-4 
                        ${buttonColorClasses[colorScheme]}
                        text-white rounded-xl text-sm font-bold 
                        transition-all shadow-lg
                        inline-flex items-center justify-center gap-2 
                        disabled:opacity-50 disabled:cursor-not-allowed
                        focus:ring-2 focus:ring-offset-2 focus:outline-none
                    `}
                    aria-busy={saving}
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Gravando...' : saveText}
                </button>

                <button
                    onClick={onReset}
                    disabled={saving}
                    className="
                        w-full py-3 px-4 
                        bg-slate-200 dark:bg-slate-800 
                        hover:bg-slate-300 dark:hover:bg-slate-700 
                        text-slate-700 dark:text-slate-300 
                        rounded-xl text-sm font-bold 
                        transition-all 
                        inline-flex items-center justify-center gap-2
                        disabled:opacity-50
                        focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:outline-none
                    "
                >
                    <RotateCcw className="w-4 h-4" />
                    {resetText}
                </button>
            </div>
        </div>
    );
}
