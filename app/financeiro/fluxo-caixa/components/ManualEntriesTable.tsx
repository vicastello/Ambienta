'use client';

import { useState, useEffect } from 'react';
import { listManualEntries, markEntryAsPaid, deleteManualEntry } from '../../actions';
import { Loader2, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function ManualEntriesTable() {
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);

    const fetchEntries = async () => {
        setLoading(true);
        try {
            const data = await listManualEntries();
            setEntries(data);
        } catch (error) {
            console.error('Failed to load manual entries', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEntries();
    }, []);

    const handlePay = async (id: string) => {
        setProcessing(id);
        try {
            await markEntryAsPaid(id, new Date().toISOString().split('T')[0]);
            await fetchEntries(); // Refresh to see status change
        } catch {
            alert('Erro ao baixar.');
        } finally {
            setProcessing(null);
        }
    };

    const handleDelete = async (id: string, description: string) => {
        if (!confirm(`Excluir "${description}"?`)) return;
        setProcessing(id);
        try {
            await deleteManualEntry(id);
            setEntries(prev => prev.filter(e => e.id !== id));
        } catch {
            alert('Erro ao excluir.');
        } finally {
            setProcessing(null);
        }
    };

    if (loading) return <div className="p-4"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>;
    if (entries.length === 0) return null; // Hide if empty

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Lançamentos Manuais</h3>
            <div className="glass-panel glass-tint rounded-3xl border border-white/40 dark:border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white/50 dark:bg-black/20 border-b border-white/20 dark:border-white/10">
                            <tr>
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">Descrição</th>
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">Vencimento</th>
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 text-right">Valor</th>
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 text-center">Status</th>
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10 dark:divide-white/5">
                            {entries.map((entry) => (
                                <tr key={entry.id} className="hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
                                    <td className="py-4 px-6 font-medium text-slate-700 dark:text-slate-200">
                                        <div className="flex flex-col">
                                            <span>{entry.description}</span>
                                            <span className="text-xs text-slate-400">{entry.category}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6 text-slate-600 dark:text-slate-400">
                                        {new Date(entry.due_date).toLocaleDateString('pt-BR')}
                                    </td>
                                    <td className={`py-4 px-6 text-right font-semibold ${entry.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {entry.type === 'income' ? '+' : '-'} {entry.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                    <td className="py-4 px-6 text-center">
                                        <StatusBadge
                                            status={entry.status === 'confirmed' ? 'success' : entry.status === 'overdue' ? 'error' : 'warning'}
                                            label={entry.status === 'confirmed' ? 'Pago' : entry.status === 'overdue' ? 'Atrasado' : 'Pendente'}
                                        />
                                    </td>
                                    <td className="py-4 px-6 text-right space-x-2">
                                        {entry.status !== 'confirmed' && (
                                            <button
                                                onClick={() => handlePay(entry.id)}
                                                disabled={processing === entry.id}
                                                className="p-1.5 rounded-full hover:bg-emerald-100 text-emerald-600 transition-colors disabled:opacity-50"
                                                title="Baixar (Confirmar Pagamento)"
                                            >
                                                {processing === entry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(entry.id, entry.description)}
                                            disabled={processing === entry.id}
                                            className="p-1.5 rounded-full hover:bg-rose-100 text-rose-600 transition-colors disabled:opacity-50"
                                            title="Excluir"
                                        >
                                            {processing === entry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
