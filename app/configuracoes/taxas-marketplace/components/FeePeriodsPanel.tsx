'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, Calendar, Loader2, Check, X, History } from 'lucide-react';

interface FeePeriod {
    id: number;
    marketplace: string;
    valid_from: string;
    valid_to: string | null;
    commission_percent: number;
    service_fee_percent: number;
    fixed_fee_per_product: number;
    notes: string | null;
}

interface FeePeriodsPanelProps {
    marketplace: 'shopee' | 'mercado_livre' | 'magalu';
}

export function FeePeriodsPanel({ marketplace }: FeePeriodsPanelProps) {
    const [periods, setPeriods] = useState<FeePeriod[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [saving, setSaving] = useState(false);

    // Form state for new/edit
    const [formData, setFormData] = useState({
        valid_from: '',
        valid_to: '',
        commission_percent: 0,
        service_fee_percent: 0,
        fixed_fee_per_product: 0,
        notes: '',
    });

    const fetchPeriods = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/configuracoes/taxas?marketplace=${marketplace}`);
            const data = await res.json();
            setPeriods(data || []);
        } catch (err) {
            console.error('Erro ao buscar períodos:', err);
        }
        setLoading(false);
    }, [marketplace]);

    useEffect(() => {
        fetchPeriods();
    }, [fetchPeriods]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const method = editingId ? 'PUT' : 'POST';
            const body = {
                ...formData,
                marketplace,
                id: editingId,
                valid_to: formData.valid_to || null,
            };

            await fetch('/api/configuracoes/taxas', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            setIsAddingNew(false);
            setEditingId(null);
            resetForm();
            fetchPeriods();
        } catch (err) {
            console.error('Erro ao salvar:', err);
        }
        setSaving(false);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Tem certeza que deseja excluir este período?')) return;

        try {
            await fetch(`/api/configuracoes/taxas?id=${id}`, { method: 'DELETE' });
            fetchPeriods();
        } catch (err) {
            console.error('Erro ao excluir:', err);
        }
    };

    const startEdit = (period: FeePeriod) => {
        setEditingId(period.id);
        setFormData({
            valid_from: period.valid_from,
            valid_to: period.valid_to || '',
            commission_percent: period.commission_percent,
            service_fee_percent: period.service_fee_percent,
            fixed_fee_per_product: period.fixed_fee_per_product,
            notes: period.notes || '',
        });
        setIsAddingNew(false);
    };

    const startAddNew = () => {
        setIsAddingNew(true);
        setEditingId(null);
        resetForm();
    };

    const resetForm = () => {
        setFormData({
            valid_from: new Date().toISOString().split('T')[0],
            valid_to: '',
            commission_percent: 20,
            service_fee_percent: 2,
            fixed_fee_per_product: 4,
            notes: '',
        });
    };

    const cancelEdit = () => {
        setIsAddingNew(false);
        setEditingId(null);
        resetForm();
    };

    const marketplaceLabel = {
        shopee: 'Shopee',
        mercado_livre: 'Mercado Livre',
        magalu: 'Magalu',
    }[marketplace];

    if (loading) {
        return (
            <div className="glass-panel glass-tint rounded-[24px] p-6">
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
            </div>
        );
    }

    return (
        <div className="glass-panel glass-tint rounded-[24px] p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <History className="w-5 h-5 text-blue-500" />
                    <h3 className="text-lg font-semibold text-main">
                        Histórico de Taxas - {marketplaceLabel}
                    </h3>
                </div>
                <button
                    onClick={startAddNew}
                    disabled={isAddingNew}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                >
                    <Plus className="w-4 h-4" />
                    Novo Período
                </button>
            </div>

            <p className="text-sm text-muted">
                Configure as taxas por período para calcular custos com base na data de criação do pedido.
            </p>

            {/* Add/Edit Form */}
            {(isAddingNew || editingId) && (
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4 space-y-4 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium">
                        <Calendar className="w-4 h-4" />
                        {editingId ? 'Editar Período' : 'Novo Período de Taxas'}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label className="text-xs text-muted block mb-1">Data Início *</label>
                            <input
                                type="date"
                                value={formData.valid_from}
                                onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted block mb-1">Data Fim (vazio = atual)</label>
                            <input
                                type="date"
                                value={formData.valid_to}
                                onChange={(e) => setFormData({ ...formData, valid_to: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted block mb-1">Comissão (%)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.commission_percent}
                                onChange={(e) => setFormData({ ...formData, commission_percent: parseFloat(e.target.value) || 0 })}
                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted block mb-1">Serviço (%)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.service_fee_percent}
                                onChange={(e) => setFormData({ ...formData, service_fee_percent: parseFloat(e.target.value) || 0 })}
                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-muted block mb-1">Taxa Fixa/Produto (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.fixed_fee_per_product}
                                onChange={(e) => setFormData({ ...formData, fixed_fee_per_product: parseFloat(e.target.value) || 0 })}
                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted block mb-1">Observações</label>
                            <input
                                type="text"
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Ex: Taxas pós Black Friday"
                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={cancelEdit}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                        >
                            <X className="w-4 h-4" />
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !formData.valid_from}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            )}

            {/* Periods List */}
            <div className="space-y-2">
                {periods.length === 0 ? (
                    <div className="text-center py-8 text-muted">
                        Nenhum período cadastrado. Clique em &quot;Novo Período&quot; para começar.
                    </div>
                ) : (
                    periods.map((period) => (
                        <div
                            key={period.id}
                            className={`flex items-center justify-between p-4 rounded-xl transition-colors ${!period.valid_to
                                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800'
                                    : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700'
                                }`}
                        >
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-main">
                                        {new Date(period.valid_from + 'T12:00:00').toLocaleDateString('pt-BR')}
                                    </span>
                                    <span className="text-muted">até</span>
                                    <span className="font-medium text-main">
                                        {period.valid_to
                                            ? new Date(period.valid_to + 'T12:00:00').toLocaleDateString('pt-BR')
                                            : <span className="text-emerald-600 dark:text-emerald-400">Atual</span>
                                        }
                                    </span>
                                    {!period.valid_to && (
                                        <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-full">
                                            Vigente
                                        </span>
                                    )}
                                </div>
                                <div className="text-sm text-muted mt-1">
                                    Comissão: <b>{period.commission_percent}%</b> |
                                    Serviço: <b>{period.service_fee_percent}%</b> |
                                    Taxa fixa: <b>R${period.fixed_fee_per_product?.toFixed(2) || '0.00'}</b>/produto
                                    {period.notes && <span className="ml-2 italic">({period.notes})</span>}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => startEdit(period)}
                                    className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(period.id)}
                                    className="p-2 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
