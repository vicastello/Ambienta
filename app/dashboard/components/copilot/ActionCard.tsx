'use client';

import { ArrowRight, ShoppingCart, Eye, FileText, Check, AlertTriangle } from 'lucide-react';

export type ActionType = 'purchase_order' | 'view_product' | 'navigate' | 'export_report' | 'generic';

interface ActionCardProps {
    type: ActionType;
    title: string;
    description?: string;
    payload?: any;
    onExecute: (type: ActionType, payload: any) => void;
    status?: 'idle' | 'loading' | 'success' | 'error';
}

export function ActionCard({ type, title, description, payload, onExecute, status = 'idle' }: ActionCardProps) {
    const getIcon = () => {
        switch (type) {
            case 'purchase_order': return <ShoppingCart size={18} />;
            case 'view_product': return <Eye size={18} />;
            case 'export_report': return <FileText size={18} />;
            case 'navigate': return <ArrowRight size={18} />;
            default: return <Sparkles size={18} />;
        }
    };

    const getColors = () => {
        switch (type) {
            case 'purchase_order': return 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20';
            case 'view_product': return 'bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20';
            case 'export_report': return 'bg-green-500/10 border-green-500/30 text-green-300 hover:bg-green-500/20';
            default: return 'bg-accent/10 border-accent/30 text-accent hover:bg-accent/20';
        }
    };

    return (
        <div className={`mt-3 mb-1 p-3 rounded-xl border ${getColors()} transition-all`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        {getIcon()}
                        <span className="font-semibold text-sm">{title}</span>
                    </div>
                    {description && (
                        <p className="text-xs opacity-80 leading-relaxed mb-2">
                            {description}
                        </p>
                    )}

                    {/* Data details if available */}
                    {payload && (type === 'purchase_order') && (
                        <div className="text-xs bg-black/20 rounded p-2 mb-2 space-y-1 font-mono opacity-90">
                            <div className="flex justify-between">
                                <span>SKU:</span>
                                <span className="font-bold">{payload.sku}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Qtd:</span>
                                <span className="font-bold">{payload.quantity}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <button
                onClick={() => onExecute(type, payload)}
                disabled={status === 'loading' || status === 'success'}
                className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${status === 'success'
                        ? 'bg-green-500/20 text-green-300 cursor-default'
                        : 'bg-white/10 hover:bg-white/20 active:scale-95 text-white'
                    }`}
            >
                {status === 'loading' && <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></span>}
                {status === 'success' && <Check size={14} />}
                {status === 'success' ? 'Realizado' : 'Executar Ação'}
            </button>
        </div>
    );
}

import { Sparkles } from 'lucide-react';
