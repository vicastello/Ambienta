'use client';

import { AlertTriangle } from 'lucide-react';
import { Campaign } from '@/app/configuracoes/taxas-marketplace/lib/types';

interface CampaignOverlapAlertProps {
    overlappingCampaigns: Campaign[];
    className?: string;
}

/**
 * Componente de alerta para exibir campanhas com períodos sobrepostos
 * 
 * Mostra uma lista detalhada de todas as campanhas que conflitam com a campanha atual,
 * incluindo seus nomes e períodos de vigência.
 */
export function CampaignOverlapAlert({ overlappingCampaigns, className = '' }: CampaignOverlapAlertProps) {
    if (overlappingCampaigns.length === 0) return null;

    return (
        <div className={`p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg ${className}`}>
            <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                    <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mb-1">
                        Atenção: Sobreposição de Períodos
                    </p>
                    <ul className="text-[11px] text-yellow-700 dark:text-yellow-400 space-y-0.5">
                        {overlappingCampaigns.map((campaign, idx) => (
                            <li key={campaign.id || idx}>
                                • Conflita com <strong>"{campaign.name}"</strong> ({formatDateRange(campaign.start_date, campaign.end_date)})
                            </li>
                        ))}
                    </ul>
                    <p className="text-[10px] text-yellow-600 dark:text-yellow-500 mt-2 italic">
                        💡 Quando há sobreposição, a campanha adicionada mais recentemente tem prioridade no cálculo.
                    </p>
                </div>
            </div>
        </div>
    );
}

function formatDateRange(start: string, end: string): string {
    const startDate = new Date(start);
    const endDate = new Date(end);

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}
