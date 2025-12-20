import { describe, it, expect } from '@jest/globals';
import { datesOverlap, detectAllCampaignOverlaps, findOverlappingCampaigns } from '@/lib/validations/campaign-overlap';
import { Campaign } from '@/app/configuracoes/taxas-marketplace/page';

describe('campaign-overlap validations', () => {
    describe('datesOverlap', () => {
        it('deve detectar sobreposição parcial no início', () => {
            // Campanha 1: 15-25/Nov, Campanha 2: 20-30/Nov
            expect(datesOverlap(
                '2024-11-15', '2024-11-25',
                '2024-11-20', '2024-11-30'
            )).toBe(true);
        });

        it('deve detectar sobreposição parcial no fim', () => {
            // Campanha 1: 20-30/Nov, Campanha 2: 15-25/Nov
            expect(datesOverlap(
                '2024-11-20', '2024-11-30',
                '2024-11-15', '2024-11-25'
            )).toBe(true);
        });

        it('deve detectar quando um período contém outro completamente', () => {
            // Campanha externa: 10-30/Nov, Campanha interna: 15-25/Nov
            expect(datesOverlap(
                '2024-11-10', '2024-11-30',
                '2024-11-15', '2024-11-25'
            )).toBe(true);
        });

        it('não deve detectar períodos separados', () => {
            // Campanha 1: 01-10/Nov, Campanha 2: 15-30/Nov (sem overlap)
            expect(datesOverlap(
                '2024-11-01', '2024-11-10',
                '2024-11-15', '2024-11-30'
            )).toBe(false);
        });

        it('deve detectar períodos adjacentes no mesmo dia', () => {
            // Campanha 1: 01-14/Nov (23:59:59), Campanha 2: 15-30/Nov
            // Como 14T23:59:59 e 15T00:00:00 estão dentro do mesmo segundo, há sobreposição técnica
            expect(datesOverlap(
                '2024-11-01', '2024-11-14T23:59:59',
                '2024-11-15', '2024-11-30'
            )).toBe(true);
        });

        it('deve aceitar objetos Date como parâmetros', () => {
            const date1Start = new Date('2024-11-15');
            const date1End = new Date('2024-11-25');
            const date2Start = new Date('2024-11-20');
            const date2End = new Date('2024-11-30');

            expect(datesOverlap(date1Start, date1End, date2Start, date2End)).toBe(true);
        });
    });

    describe('detectAllCampaignOverlaps', () => {
        it('deve detectar múltiplas sobreposições', () => {
            const campaigns: Campaign[] = [
                { id: '1', name: 'Black Friday', fee_rate: 2, start_date: '2024-11-01', end_date: '2024-11-15', is_active: true },
                { id: '2', name: 'Cyber Monday', fee_rate: 2.5, start_date: '2024-11-10', end_date: '2024-11-20', is_active: true },
                { id: '3', name: 'Natal', fee_rate: 3, start_date: '2024-11-18', end_date: '2024-11-30', is_active: true },
            ];

            const overlaps = detectAllCampaignOverlaps(campaigns);

            // Deve encontrar 2 overlaps: BF-CM e CM-Natal
            expect(overlaps.length).toBe(2);

            // Verificar que os IDs estão corretos
            const overlapIds = overlaps.map(o => [o.campaign1.id, o.campaign2.id].sort());
            expect(overlapIds).toContainEqual(['1', '2']); // BF e CM
            expect(overlapIds).toContainEqual(['2', '3']); // CM e Natal
        });

        it('deve ignorar campanhas inativas', () => {
            const campaigns: Campaign[] = [
                { id: '1', name: 'Ativa', fee_rate: 2, start_date: '2024-11-01', end_date: '2024-11-15', is_active: true },
                { id: '2', name: 'Inativa', fee_rate: 2, start_date: '2024-11-10', end_date: '2024-11-20', is_active: false },
            ];

            const overlaps = detectAllCampaignOverlaps(campaigns);
            expect(overlaps.length).toBe(0);
        });

        it('deve retornar array vazio quando não há sobreposições', () => {
            const campaigns: Campaign[] = [
                { id: '1', name: 'C1', fee_rate: 2, start_date: '2024-11-01', end_date: '2024-11-10', is_active: true },
                { id: '2', name: 'C2', fee_rate: 2, start_date: '2024-11-15', end_date: '2024-11-25', is_active: true },
                { id: '3', name: 'C3', fee_rate: 2, start_date: '2024-12-01', end_date: '2024-12-10', is_active: true },
            ];

            const overlaps = detectAllCampaignOverlaps(campaigns);
            expect(overlaps.length).toBe(0);
        });

        it('deve retornar array vazio para lista vazia', () => {
            const overlaps = detectAllCampaignOverlaps([]);
            expect(overlaps.length).toBe(0);
        });

        it('deve determinar tipo de sobreposição corretamente', () => {
            const campaigns: Campaign[] = [
                { id: '1', name: 'Externa', fee_rate: 2, start_date: '2024-11-01', end_date: '2024-11-30', is_active: true },
                { id: '2', name: 'Interna', fee_rate: 2, start_date: '2024-11-10', end_date: '2024-11-20', is_active: true },
            ];

            const overlaps = detectAllCampaignOverlaps(campaigns);
            expect(overlaps.length).toBe(1);
            expect(overlaps[0].overlapType).toBe('contains');
        });
    });

    describe('findOverlappingCampaigns', () => {
        const existingCampaigns: Campaign[] = [
            { id: '1', name: 'Campanha 1', fee_rate: 2, start_date: '2024-11-01', end_date: '2024-11-15', is_active: true },
            { id: '2', name: 'Campanha 2', fee_rate: 2.5, start_date: '2024-11-20', end_date: '2024-11-30', is_active: true },
            { id: '3', name: 'Campanha Inativa', fee_rate: 3, start_date: '2024-11-01', end_date: '2024-11-30', is_active: false },
        ];

        it('deve encontrar campanhas que se sobrepõem', () => {
            const newCampaign = {
                start_date: '2024-11-10',
                end_date: '2024-11-25',
                is_active: true
            };

            const conflicts = findOverlappingCampaigns(newCampaign, existingCampaigns);

            // Deve conflitar com Campanha 1 e Campanha 2
            expect(conflicts.length).toBe(2);
            expect(conflicts.map(c => c.id)).toContain('1');
            expect(conflicts.map(c => c.id)).toContain('2');
        });

        it('deve ignorar campanhas inativas', () => {
            const newCampaign = {
                start_date: '2024-11-05',
                end_date: '2024-11-25',
                is_active: true
            };

            const conflicts = findOverlappingCampaigns(newCampaign, existingCampaigns);

            // Não deve incluir a Campanha 3 (inativa)
            expect(conflicts.map(c => c.id)).not.toContain('3');
        });

        it('deve excluir campanha específica por ID (útil ao editar)', () => {
            const editedCampaign = {
                start_date: '2024-11-01',
                end_date: '2024-11-15',
                is_active: true
            };

            // Editando a campanha '1', não deve retornar ela mesma como conflito
            const conflicts = findOverlappingCampaigns(editedCampaign, existingCampaigns, '1');

            expect(conflicts.map(c => c.id)).not.toContain('1');
        });

        it('deve retornar array vazio se nova campanha é inativa', () => {
            const newCampaign = {
                start_date: '2024-11-01',
                end_date: '2024-11-30',
                is_active: false
            };

            const conflicts = findOverlappingCampaigns(newCampaign, existingCampaigns);
            expect(conflicts.length).toBe(0);
        });

        it('deve retornar array vazio se não há overlaps', () => {
            const newCampaign = {
                start_date: '2024-12-01',
                end_date: '2024-12-10',
                is_active: true
            };

            const conflicts = findOverlappingCampaigns(newCampaign, existingCampaigns);
            expect(conflicts.length).toBe(0);
        });
    });
});
