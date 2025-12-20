import { Campaign } from '@/app/configuracoes/taxas-marketplace/lib/types';

export interface DateRange {
    start: Date;
    end: Date;
}

export interface CampaignOverlap {
    campaign1: Campaign;
    campaign2: Campaign;
    overlapType: 'partial_start' | 'partial_end' | 'complete_overlap' | 'contains';
}

/**
 * Verifica se dois intervalos de datas se sobrepõem
 * 
 * @param start1 Data de início do primeiro período
 * @param end1 Data de término do primeiro período
 * @param start2 Data de início do segundo período
 * @param end2 Data de término do segundo período
 * @returns true se há sobreposição, false caso contrário
 * 
 * @example
 * datesOverlap('2024-11-15', '2024-11-25', '2024-11-20', '2024-11-30') // true
 * datesOverlap('2024-11-01', '2024-11-10', '2024-11-15', '2024-11-30') // false
 */
export function datesOverlap(
    start1: Date | string,
    end1: Date | string,
    start2: Date | string,
    end2: Date | string
): boolean {
    const s1 = new Date(start1);
    const e1 = new Date(end1);
    const s2 = new Date(start2);
    const e2 = new Date(end2);

    return (
        (s1 >= s2 && s1 <= e2) ||  // start1 está dentro do range2
        (e1 >= s2 && e1 <= e2) ||  // end1 está dentro do range2
        (s1 <= s2 && e1 >= e2)     // range1 contém range2 completamente
    );
}

/**
 * Detecta todas as campanhas com períodos sobrepostos
 * Retorna array de pares de campanhas que conflitam
 * 
 * Apenas campanhas ativas são consideradas para detecção de conflitos.
 * 
 * @param campaigns Array de campanhas a ser analisado
 * @returns Array de objetos descrevendo sobreposições encontradas
 * 
 * @example
 * const campaigns = [
 *   { id: '1', name: 'BF', start_date: '2024-11-01', end_date: '2024-11-15', is_active: true },
 *   { id: '2', name: 'CM', start_date: '2024-11-10', end_date: '2024-11-20', is_active: true },
 * ];
 * const overlaps = detectAllCampaignOverlaps(campaigns);
 * // overlaps.length === 1 (BF e CM se sobrepõem)
 */
export function detectAllCampaignOverlaps(campaigns: Campaign[]): CampaignOverlap[] {
    const overlaps: CampaignOverlap[] = [];
    const activeCampaigns = campaigns.filter(c => c.is_active);

    for (let i = 0; i < activeCampaigns.length; i++) {
        for (let j = i + 1; j < activeCampaigns.length; j++) {
            const c1 = activeCampaigns[i];
            const c2 = activeCampaigns[j];

            if (datesOverlap(c1.start_date, c1.end_date, c2.start_date, c2.end_date)) {
                overlaps.push({
                    campaign1: c1,
                    campaign2: c2,
                    overlapType: determineOverlapType(c1, c2)
                });
            }
        }
    }

    return overlaps;
}

/**
 * Verifica se uma campanha específica sobrepõe com outras campanhas existentes
 * 
 * @param targetCampaign Campanha a ser verificada (pode ser uma campanha em criação/edição)
 * @param existingCampaigns Array de campanhas existentes para comparar
 * @param excludeId ID opcional para excluir da comparação (útil ao editar campanha existente)
 * @returns Array de campanhas que se sobrepõem com a campanha alvo
 * 
 * @example
 * const newCampaign = { start_date: '2024-11-15', end_date: '2024-11-25', is_active: true };
 * const conflicts = findOverlappingCampaigns(newCampaign, existingCampaigns);
 * if (conflicts.length > 0) {
 *   console.log(`Conflita com: ${conflicts.map(c => c.name).join(', ')}`);
 * }
 */
export function findOverlappingCampaigns(
    targetCampaign: { start_date: string; end_date: string; is_active: boolean },
    existingCampaigns: Campaign[],
    excludeId?: string
): Campaign[] {
    if (!targetCampaign.is_active) return [];

    return existingCampaigns.filter(c => {
        if (c.id === excludeId || !c.is_active) return false;
        return datesOverlap(
            targetCampaign.start_date,
            targetCampaign.end_date,
            c.start_date,
            c.end_date
        );
    });
}

/**
 * Determina o tipo específico de sobreposição entre duas campanhas
 * 
 * @internal
 */
function determineOverlapType(c1: Campaign, c2: Campaign): CampaignOverlap['overlapType'] {
    const s1 = new Date(c1.start_date);
    const e1 = new Date(c1.end_date);
    const s2 = new Date(c2.start_date);
    const e2 = new Date(c2.end_date);

    // c1 contém c2 completamente
    if (s1 <= s2 && e1 >= e2) return 'contains';
    // c2 contém c1 completamente
    if (s2 <= s1 && e2 >= e1) return 'contains';
    // c1 inicia dentro de c2
    if (s1 >= s2 && s1 <= e2) return 'partial_start';
    // c1 termina dentro de c2
    if (e1 >= s2 && e1 <= e2) return 'partial_end';

    return 'complete_overlap';
}
