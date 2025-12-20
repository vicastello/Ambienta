'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Calendar, AlertTriangle } from 'lucide-react';
import { Campaign } from '@/app/configuracoes/taxas-marketplace/lib/types';
import { findOverlappingCampaigns, detectAllCampaignOverlaps, CampaignOverlap } from '@/lib/validations/campaign-overlap';
import { CampaignOverlapAlert } from './CampaignOverlapAlert';

interface CampaignManagerProps {
    campaigns: Campaign[];
    onChange: (campaigns: Campaign[]) => void;
    /** Called after any campaign change with the NEW campaigns array */
    onAutoSave?: (updatedCampaigns: Campaign[]) => void;
}

interface CampaignFormData {
    name: string;
    fee_rate: number;
    start_date: string;
    end_date: string;
    is_active: boolean;
}

export function CampaignManager({ campaigns, onChange, onAutoSave }: CampaignManagerProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<CampaignFormData>({
        name: '',
        fee_rate: 2.5,
        start_date: '',
        end_date: '',
        is_active: true,
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [allOverlaps, setAllOverlaps] = useState<CampaignOverlap[]>([]);

    // Detectar sobreposições sempre que as campanhas mudarem
    useEffect(() => {
        const overlaps = detectAllCampaignOverlaps(campaigns);
        setAllOverlaps(overlaps);
    }, [campaigns]);

    const resetForm = () => {
        setFormData({
            name: '',
            fee_rate: 2.5,
            start_date: '',
            end_date: '',
            is_active: true,
        });
        setErrors({});
        setIsAdding(false);
        setEditingId(null);
    };

    const validateForm = (data: CampaignFormData, excludeId?: string): boolean => {
        const newErrors: Record<string, string> = {};

        // Name validation
        if (!data.name.trim()) {
            newErrors.name = 'Nome é obrigatório';
        } else if (data.name.length > 50) {
            newErrors.name = 'Nome deve ter no máximo 50 caracteres';
        }

        // Fee rate validation
        if (data.fee_rate < 0 || data.fee_rate > 100) {
            newErrors.fee_rate = 'Taxa deve estar entre 0% e 100%';
        }

        // Date validation
        if (!data.start_date) {
            newErrors.start_date = 'Data de início é obrigatória';
        }
        if (!data.end_date) {
            newErrors.end_date = 'Data de término é obrigatória';
        }
        if (data.start_date && data.end_date) {
            const start = new Date(data.start_date);
            const end = new Date(data.end_date);
            if (start >= end) {
                newErrors.end_date = 'Data de término deve ser posterior à data de início';
            }

            // Note: Overlap validation is now handled by CampaignOverlapAlert component
            // We no longer add overlaps to errors to avoid redundancy and maintain
            // proper visual hierarchy (yellow warning vs red error)
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleAdd = () => {
        if (!validateForm(formData)) return;

        const newCampaign: Campaign = {
            id: crypto.randomUUID(),
            name: formData.name.trim(),
            fee_rate: formData.fee_rate,
            start_date: formData.start_date,
            end_date: formData.end_date,
            is_active: formData.is_active,
        };

        const newCampaigns = [...campaigns, newCampaign];
        onChange(newCampaigns);
        resetForm();
        // Auto-save with the new campaigns array
        onAutoSave?.(newCampaigns);
    };

    const handleEdit = (campaign: Campaign) => {
        setEditingId(campaign.id);
        setFormData({
            name: campaign.name,
            fee_rate: campaign.fee_rate,
            start_date: campaign.start_date,
            end_date: campaign.end_date,
            is_active: campaign.is_active,
        });
    };

    const handleUpdate = () => {
        if (!editingId || !validateForm(formData, editingId)) return;

        const updated = campaigns.map((c) =>
            c.id === editingId
                ? {
                    ...c,
                    name: formData.name.trim(),
                    fee_rate: formData.fee_rate,
                    start_date: formData.start_date,
                    end_date: formData.end_date,
                    is_active: formData.is_active,
                }
                : c
        );

        onChange(updated);
        resetForm();
        // Auto-save with the updated campaigns array
        onAutoSave?.(updated);
    };

    const handleDelete = (id: string) => {
        if (confirm('Tem certeza que deseja excluir esta campanha?')) {
            const filtered = campaigns.filter((c) => c.id !== id);
            onChange(filtered);
            // Auto-save with the filtered campaigns array
            onAutoSave?.(filtered);
        }
    };

    const handleToggleActive = (id: string) => {
        const updated = campaigns.map((c) =>
            c.id === id ? { ...c, is_active: !c.is_active } : c
        );
        onChange(updated);
        // Auto-save with the toggled campaigns array
        onAutoSave?.(updated);
    };

    const getDaysUntilEnd = (endDate: string): number => {
        const end = new Date(endDate);
        const now = new Date();
        const diff = end.getTime() - now.getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    /**
     * Retorna array de campanhas que conflitam com a campanha especificada
     */
    const getCampaignConflicts = (campaignId: string): Campaign[] => {
        const conflicts: Campaign[] = [];
        allOverlaps.forEach(overlap => {
            if (overlap.campaign1.id === campaignId) {
                conflicts.push(overlap.campaign2);
            } else if (overlap.campaign2.id === campaignId) {
                conflicts.push(overlap.campaign1);
            }
        });
        return conflicts;
    };

    return (
        <div className="space-y-4">
            {/* Campaign List */}
            {campaigns.length === 0 && !isAdding && !editingId && (
                <div className="text-center py-8 text-muted">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma campanha configurada ainda.</p>
                    <p className="text-xs mt-1">Clique em "+ Nova Campanha" para adicionar.</p>
                </div>
            )}

            {campaigns.map((campaign) => {
                const daysUntilEnd = getDaysUntilEnd(campaign.end_date);
                const isExpiringSoon = campaign.is_active && daysUntilEnd > 0 && daysUntilEnd <= 7;
                const isExpired = daysUntilEnd < 0;

                if (editingId === campaign.id) {
                    return (
                        <div
                            key={campaign.id}
                            className="p-4 bg-blue-500/10 border-2 border-blue-500/30 rounded-xl space-y-3"
                        >
                            <h4 className="text-sm font-bold text-main mb-3">Editando Campanha</h4>
                            {(() => {
                                const overlapping = findOverlappingCampaigns(
                                    formData,
                                    campaigns,
                                    editingId
                                );
                                return overlapping.length > 0 && (
                                    <CampaignOverlapAlert
                                        overlappingCampaigns={overlapping}
                                        className="mb-3"
                                    />
                                );
                            })()}
                            <CampaignForm
                                data={formData}
                                onChange={setFormData}
                                errors={errors}
                            />
                            <div className="flex gap-2 justify-end pt-2">
                                <button
                                    onClick={resetForm}
                                    className="px-4 py-2 text-sm rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleUpdate}
                                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-all"
                                >
                                    Atualizar
                                </button>
                            </div>
                        </div>
                    );
                }

                return (
                    <div
                        key={campaign.id}
                        className={`p-4 rounded-xl border transition-all ${campaign.is_active
                            ? 'bg-emerald-500/5 border-emerald-500/20'
                            : 'bg-slate-500/5 border-slate-500/20 opacity-60'
                            }`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-sm font-bold text-main">{campaign.name}</h3>
                                    <span
                                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${campaign.is_active
                                            ? 'bg-emerald-500 text-white'
                                            : 'bg-slate-400 text-white'
                                            }`}
                                    >
                                        {campaign.is_active ? 'Ativa' : 'Inativa'}
                                    </span>
                                    {isExpiringSoon && (
                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-yellow-500 text-white flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />
                                            Expira em {daysUntilEnd} {daysUntilEnd === 1 ? 'dia' : 'dias'}
                                        </span>
                                    )}
                                    {isExpired && (
                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white">
                                            Expirada
                                        </span>
                                    )}
                                    {(() => {
                                        const conflicts = getCampaignConflicts(campaign.id);
                                        return conflicts.length > 0 && (
                                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-orange-500 text-white flex items-center gap-1" title={`Conflita com: ${conflicts.map(c => c.name).join(', ')}`}>
                                                <AlertTriangle className="w-3 h-3" />
                                                {conflicts.length} conflito{conflicts.length > 1 ? 's' : ''}
                                            </span>
                                        );
                                    })()}
                                </div>
                                <div className="flex items-center gap-4 text-xs text-muted">
                                    <span>
                                        📅 {formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}
                                    </span>
                                    <span>💰 Taxa: {campaign.fee_rate}%</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleToggleActive(campaign.id)}
                                    className={`px-3 py-1.5 text-xs rounded-lg transition-all ${campaign.is_active
                                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                        }`}
                                    title={campaign.is_active ? 'Desativar' : 'Ativar'}
                                >
                                    {campaign.is_active ? 'Desativar' : 'Ativar'}
                                </button>
                                <button
                                    onClick={() => handleEdit(campaign)}
                                    className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                                    title="Editar"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(campaign.id)}
                                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                    title="Excluir"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Add New Form */}
            {isAdding && (
                <div className="p-4 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-xl space-y-3">
                    <h4 className="text-sm font-bold text-main mb-3">Nova Campanha</h4>
                    {(() => {
                        const overlapping = findOverlappingCampaigns(
                            formData,
                            campaigns,
                            undefined
                        );
                        return overlapping.length > 0 && (
                            <CampaignOverlapAlert
                                overlappingCampaigns={overlapping}
                                className="mb-3"
                            />
                        );
                    })()}
                    <CampaignForm
                        data={formData}
                        onChange={setFormData}
                        errors={errors}
                    />
                    <div className="flex gap-2 justify-end pt-2">
                        <button
                            onClick={resetForm}
                            className="px-4 py-2 text-sm rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleAdd}
                            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all"
                        >
                            Adicionar
                        </button>
                    </div>
                </div>
            )}

            {/* Add Button */}
            {!isAdding && !editingId && (
                <button
                    onClick={() => setIsAdding(true)}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all inline-flex items-center justify-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Nova Campanha
                </button>
            )}
        </div>
    );
}

// Form Component
interface CampaignFormProps {
    data: CampaignFormData;
    onChange: (data: CampaignFormData) => void;
    errors: Record<string, string>;
}

function CampaignForm({ data, onChange, errors }: CampaignFormProps) {
    return (
        <div className="space-y-3">
            {errors.dates && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-300 font-medium">{errors.dates}</p>
                </div>
            )}

            <div className="space-y-1">
                <label className="block text-xs font-medium text-main">Nome da Campanha</label>
                <input
                    type="text"
                    value={data.name}
                    onChange={(e) => onChange({ ...data, name: e.target.value })}
                    placeholder="Ex: Black Friday 2024"
                    maxLength={50}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                {errors.name && <p className="text-xs text-red-600 dark:text-red-400">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="block text-xs font-medium text-main">Taxa da Campanha (%)</label>
                    <input
                        type="number"
                        step="0.1"
                        value={data.fee_rate}
                        onChange={(e) => onChange({ ...data, fee_rate: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    {errors.fee_rate && <p className="text-xs text-red-600 dark:text-red-400">{errors.fee_rate}</p>}
                </div>

                <div className="space-y-1">
                    <label className="block text-xs font-medium text-main">Status</label>
                    <select
                        value={data.is_active ? 'active' : 'inactive'}
                        onChange={(e) => onChange({ ...data, is_active: e.target.value === 'active' })}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                        <option value="active">Ativa</option>
                        <option value="inactive">Inativa</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="block text-xs font-medium text-main">Data de Início</label>
                    <input
                        type="datetime-local"
                        value={data.start_date}
                        onChange={(e) => onChange({ ...data, start_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    {errors.start_date && <p className="text-xs text-red-600 dark:text-red-400">{errors.start_date}</p>}
                </div>

                <div className="space-y-1">
                    <label className="block text-xs font-medium text-main">Data de Término</label>
                    <input
                        type="datetime-local"
                        value={data.end_date}
                        onChange={(e) => onChange({ ...data, end_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    {errors.end_date && <p className="text-xs text-red-600 dark:text-red-400">{errors.end_date}</p>}
                </div>
            </div>
        </div>
    );
}
