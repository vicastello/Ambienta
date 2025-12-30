/**
 * Script para verificar se as taxas históricas estão configuradas e funcionando
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('🔍 Verificando tabela marketplace_fee_periods...\n');

    // 1. Check if table exists and has data
    const { data: periods, error } = await supabase
        .from('marketplace_fee_periods')
        .select('*')
        .order('marketplace')
        .order('valid_from', { ascending: false });

    if (error) {
        console.error('❌ Erro ao buscar períodos:', error.message);
        console.log('\n⚠️  A tabela pode não existir. Execute a migration:');
        console.log('   supabase db push --linked');
        return;
    }

    if (!periods || periods.length === 0) {
        console.log('⚠️  Tabela existe, mas está vazia!');
        console.log('   Adicione períodos de taxas via UI ou execute a migration com dados iniciais.');
        return;
    }

    console.log(`✅ Encontrados ${periods.length} períodos de taxas:\n`);

    // Group by marketplace
    const byMarketplace: Record<string, any[]> = {};
    periods.forEach(p => {
        if (!byMarketplace[p.marketplace]) byMarketplace[p.marketplace] = [];
        byMarketplace[p.marketplace].push(p);
    });

    for (const [marketplace, mPeriods] of Object.entries(byMarketplace)) {
        console.log(`📦 ${marketplace.toUpperCase()}`);
        for (const p of mPeriods) {
            console.log(`   📅 ${p.valid_from} até ${p.valid_to || 'atual'}`);
            console.log(`      Comissão: ${p.commission_percent}% | Serviço: ${p.service_fee_percent}% | Fixo/produto: R$ ${p.fixed_fee_per_product}`);
        }
        console.log('');
    }

    // 2. Test fee lookup for a specific date
    console.log('🧪 Testando consulta de taxas por data...\n');

    const testCases = [
        { marketplace: 'shopee', date: '2024-11-15' },
        { marketplace: 'shopee', date: '2025-01-15' },
        { marketplace: 'shopee', date: '2025-12-15' },
    ];

    for (const tc of testCases) {
        const { data, error: queryError } = await supabase
            .from('marketplace_fee_periods')
            .select('*')
            .eq('marketplace', tc.marketplace)
            .lte('valid_from', tc.date)
            .or(`valid_to.gte.${tc.date},valid_to.is.null`)
            .order('valid_from', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (queryError) {
            console.log(`   ❌ ${tc.marketplace} em ${tc.date}: Erro - ${queryError.message}`);
        } else if (data) {
            console.log(`   ✅ ${tc.marketplace} em ${tc.date}: Comissão ${data.commission_percent}% (período ${data.valid_from} - ${data.valid_to || 'atual'})`);
        } else {
            console.log(`   ⚠️  ${tc.marketplace} em ${tc.date}: Nenhum período encontrado (usará defaults)`);
        }
    }

    console.log('\n✅ Verificação concluída!');
}

main().catch(console.error);
