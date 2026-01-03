'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, History, RotateCcw, ChevronDown, ChevronUp, Check, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuditEntry {
    id: string;
    rule_id: string;
    rule_name: string | null;
    action: 'created' | 'updated' | 'deleted' | 'enabled' | 'disabled' | 'metrics_updated';
    previous_data: Record<string, unknown> | null;
    new_data: Record<string, unknown> | null;
    changed_by: string | null;
    change_reason: string | null;
    changed_at: string;
}

interface RuleHistoryModalProps {
    ruleId: string;
    ruleName: string;
    isOpen: boolean;
    onClose: () => void;
    onRestored?: () => void;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    created: { label: 'Criada', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    updated: { label: 'Atualizada', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    deleted: { label: 'Excluída', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
    enabled: { label: 'Ativada', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    disabled: { label: 'Desativada', color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
    metrics_updated: { label: 'Métricas', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
};

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'agora';
    if (diffMins < 60) return `${diffMins}min atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays < 7) return `${diffDays}d atrás`;
    return formatDate(dateStr);
}

/**
 * DiffViewer - Shows differences between two data versions
 */
function DiffViewer({ previous, current }: { previous: Record<string, unknown> | null; current: Record<string, unknown> | null }) {
    if (!previous && !current) return null;

    const allKeys = new Set([
        ...Object.keys(previous || {}),
        ...Object.keys(current || {}),
    ]);

    const relevantKeys = Array.from(allKeys).filter(key =>
        !['id', 'created_at', 'updated_at', 'match_count', 'last_applied_at', 'total_impact'].includes(key)
    );

    const changes = relevantKeys.filter(key => {
        const prevVal = JSON.stringify(previous?.[key]);
        const currVal = JSON.stringify(current?.[key]);
        return prevVal !== currVal;
    });

    if (changes.length === 0) {
        return <p className="text-xs text-gray-500">Sem alterações significativas</p>;
    }

    return (
        <div className="space-y-2 text-xs">
            {changes.map(key => (
                <div key={key} className="flex flex-col gap-0.5">
                    <span className="font-medium text-gray-600 dark:text-gray-400">{key}:</span>
                    <div className="flex gap-2 pl-2">
                        {previous?.[key] !== undefined && (
                            <span className="text-rose-600 dark:text-rose-400 line-through">
                                {JSON.stringify(previous[key])?.slice(0, 80)}
                            </span>
                        )}
                        {current?.[key] !== undefined && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                                {JSON.stringify(current[key])?.slice(0, 80)}
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * RuleHistoryModal - View audit history and restore previous versions
 */
export default function RuleHistoryModal({
    ruleId,
    ruleName,
    isOpen,
    onClose,
    onRestored,
}: RuleHistoryModalProps) {
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/financeiro/rules/audit?ruleId=${ruleId}&limit=50`);
            const data = await res.json();
            if (data.success) {
                setEntries(data.entries || []);
            } else {
                setError(data.error || 'Erro ao carregar histórico');
            }
        } catch (err) {
            console.error('[RuleHistoryModal] Error:', err);
            setError('Erro de conexão');
        } finally {
            setLoading(false);
        }
    }, [ruleId]);

    useEffect(() => {
        if (isOpen) {
            fetchHistory();
        }
    }, [isOpen, fetchHistory]);

    const handleRestore = async (auditId: string, useNewData: boolean = false) => {
        setRestoring(auditId);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch('/api/financeiro/rules/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auditId, useNewData }),
            });

            const data = await res.json();

            if (data.success) {
                setSuccess(data.message || 'Regra restaurada com sucesso!');
                onRestored?.();
                setTimeout(() => {
                    onClose();
                }, 1500);
            } else {
                setError(data.error || 'Erro ao restaurar');
            }
        } catch (err) {
            console.error('[RuleHistoryModal] Restore error:', err);
            setError('Erro de conexão ao restaurar');
        } finally {
            setRestoring(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <History className="w-5 h-5 text-purple-500" />
                        <div>
                            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                                Histórico da Regra
                            </h2>
                            <p className="text-sm text-gray-500">{ruleName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {/* Messages */}
                    {error && (
                        <div className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            {success}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p>Nenhum histórico encontrado</p>
                            <p className="text-sm mt-1">As alterações aparecerão aqui após a migração ser executada.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {entries.map((entry, index) => {
                                const actionInfo = ACTION_LABELS[entry.action] || { label: entry.action, color: 'bg-gray-100 text-gray-700' };
                                const isExpanded = expandedEntry === entry.id;
                                const canRestore = entry.action !== 'created' && entry.previous_data;

                                return (
                                    <div
                                        key={entry.id}
                                        className="border border-white/20 dark:border-white/10 rounded-xl bg-white/50 dark:bg-white/5 overflow-hidden"
                                    >
                                        <div
                                            className="p-3 cursor-pointer hover:bg-white/30 dark:hover:bg-white/10 transition-colors"
                                            onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <span className={cn('px-2 py-0.5 rounded-lg text-xs font-medium', actionInfo.color)}>
                                                        {actionInfo.label}
                                                    </span>
                                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                                        {formatRelativeTime(entry.changed_at)}
                                                    </span>
                                                    {index === 0 && (
                                                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                                            atual
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {canRestore && index > 0 && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRestore(entry.id, false);
                                                            }}
                                                            disabled={restoring !== null}
                                                            className="px-2 py-1 rounded-lg text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors flex items-center gap-1 disabled:opacity-50"
                                                            title="Restaurar para versão anterior a esta alteração"
                                                        >
                                                            {restoring === entry.id ? (
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <RotateCcw className="w-3 h-3" />
                                                            )}
                                                            Restaurar
                                                        </button>
                                                    )}
                                                    {isExpanded ? (
                                                        <ChevronUp className="w-4 h-4 text-gray-400" />
                                                    ) : (
                                                        <ChevronDown className="w-4 h-4 text-gray-400" />
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {formatDate(entry.changed_at)}
                                                {entry.changed_by && entry.changed_by !== 'system' && ` • por ${entry.changed_by}`}
                                            </p>
                                        </div>

                                        {isExpanded && (
                                            <div className="px-3 pb-3 pt-2 border-t border-white/10 dark:border-white/5">
                                                <DiffViewer previous={entry.previous_data} current={entry.new_data} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end p-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}
