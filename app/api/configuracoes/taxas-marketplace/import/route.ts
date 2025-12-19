import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { clearFeeConfigCache } from '@/lib/marketplace-fees';

/**
 * API para importar configurações de marketplace
 * POST: Upload de arquivo JSON ou CSV
 */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const isPreview = formData.get('preview') === 'true';

        if (!file) {
            return NextResponse.json(
                { error: 'Nenhum arquivo enviado' },
                { status: 400 }
            );
        }

        // Parse file content
        const content = await file.text();
        let importedData: any;

        try {
            if (file.name.endsWith('.json')) {
                importedData = JSON.parse(content);
            } else if (file.name.endsWith('.csv')) {
                importedData = parseCSV(content);
            } else {
                return NextResponse.json(
                    { error: 'Formato não suportado. Use JSON ou CSV.' },
                    { status: 400 }
                );
            }
        } catch (error) {
            return NextResponse.json(
                { error: 'Arquivo inválido ou corrompido' },
                { status: 400 }
            );
        }

        // Extract configs from imported data
        const configs = importedData.configs || importedData;

        // Validate configs
        const validation = validateConfigs(configs);
        if (!validation.isValid) {
            return NextResponse.json(
                {
                    isValid: false,
                    errors: validation.errors,
                    warnings: validation.warnings,
                },
                { status: 400 }
            );
        }

        // Preview mode: return diff without saving
        if (isPreview) {
            const supabase = await createClient();
            const currentConfigs = await loadCurrentConfigs(supabase);
            const preview = calculateDiff(currentConfigs, configs);

            return NextResponse.json({
                isValid: true,
                errors: [],
                warnings: validation.warnings,
                preview,
            });
        }

        // Apply mode: save to database
        const supabase = await createClient();
        await saveConfigs(supabase, configs);

        // Clear cache
        clearFeeConfigCache();

        return NextResponse.json({
            success: true,
            configs,
        });
    } catch (error) {
        console.error('Import error:', error);
        return NextResponse.json(
            { error: 'Erro interno ao processar importação' },
            { status: 500 }
        );
    }
}

/**
 * Parse CSV content to config object
 */
function parseCSV(content: string): any {
    const configs: any = {};
    const lines = content.split('\n').slice(1); // Skip header

    lines.forEach(line => {
        if (!line.trim()) return;

        const [marketplace, field, value] = line.split(',').map(s => s.trim());

        if (!configs[marketplace.toLowerCase().replace(' ', '_')]) {
            configs[marketplace.toLowerCase().replace(' ', '_')] = {};
        }

        // Parse value
        const numValue = parseFloat(value.replace(/[^\d.-]/g, ''));
        configs[marketplace.toLowerCase().replace(' ', '_')][field] = numValue;
    });

    return { configs };
}

/**
 * Validate imported configs
 */
function validateConfigs(configs: any): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
} {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if configs object exists
    if (!configs || typeof configs !== 'object') {
        errors.push('Formato de configuração inválido');
        return { isValid: false, errors, warnings };
    }

    // Validate Shopee
    if (configs.shopee) {
        if (configs.shopee.base_commission < 0 || configs.shopee.base_commission > 100) {
            errors.push('Shopee: Comissão base deve estar entre 0% e 100%');
        }
        if (configs.shopee.base_commission > 30) {
            warnings.push('Shopee: Comissão base muito alta (>30%)');
        }
        if (configs.shopee.fixed_cost_per_product < 0) {
            errors.push('Shopee: Custo fixo não pode ser negativo');
        }
    }

    // Validate Mercado Livre
    if (configs.mercado_livre) {
        if (configs.mercado_livre.premium_commission < 0 || configs.mercado_livre.premium_commission > 100) {
            errors.push('Mercado Livre: Comissão deve estar entre 0% e 100%');
        }
        if (configs.mercado_livre.premium_commission > 30) {
            warnings.push('Mercado Livre: Comissão muito alta (>30%)');
        }
    }

    // Validate Magalu
    if (configs.magalu) {
        if (configs.magalu.commission < 0 || configs.magalu.commission > 100) {
            errors.push('Magalu: Comissão deve estar entre 0% e 100%');
        }
        if (configs.magalu.fixed_cost < 0) {
            errors.push('Magalu: Custo fixo não pode ser negativo');
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Load current configs from database
 */
async function loadCurrentConfigs(supabase: any): Promise<any> {
    const { data } = await supabase
        .from('marketplace_fee_config')
        .select('marketplace, config');

    const configs: any = {};
    data?.forEach((row: any) => {
        configs[row.marketplace] = row.config;
    });

    return configs;
}

/**
 * Calculate diff between current and new configs
 */
function calculateDiff(currentConfigs: any, newConfigs: any): any[] {
    const preview: any[] = [];

    Object.keys(newConfigs).forEach(marketplace => {
        const changes: any[] = [];
        const currentConfig = currentConfigs[marketplace] || {};
        const newConfig = newConfigs[marketplace];

        Object.keys(newConfig).forEach(field => {
            if (typeof newConfig[field] === 'object') return; // Skip nested objects for now

            const oldValue = currentConfig[field];
            const newValue = newConfig[field];

            if (oldValue !== newValue) {
                let status: 'ok' | 'warning' | 'error' = 'ok';

                // Determine status
                if (typeof newValue === 'number') {
                    if (newValue < 0) status = 'error';
                    else if (newValue > 100 && field.includes('commission')) status = 'error';
                    else if (newValue > 30 && field.includes('commission')) status = 'warning';
                }

                changes.push({
                    field,
                    oldValue,
                    newValue,
                    status,
                });
            }
        });

        if (changes.length > 0) {
            preview.push({
                marketplace,
                changes,
            });
        }
    });

    return preview;
}

/**
 * Save configs to database
 */
async function saveConfigs(supabase: any, configs: any): Promise<void> {
    for (const [marketplace, config] of Object.entries(configs)) {
        await supabase
            .from('marketplace_fee_config')
            .update({ config })
            .eq('marketplace', marketplace);
    }
}
