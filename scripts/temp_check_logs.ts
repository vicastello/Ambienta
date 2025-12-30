
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkRecentLogs() {
    console.log('🔍 Buscando logs recentes...');
    const { data, error } = await supabaseAdmin
        .from('sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15);

    if (error) {
        console.error('❌ Erro ao buscar logs:', error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.log('⚠️ Nenhum log encontrado.');
        return;
    }

    data.forEach(log => {
        const date = new Date(log.created_at).toLocaleString('pt-BR');
        console.log(`[${date}] ${log.level.toUpperCase()}: ${log.message}`);
        if (log.meta) {
            try {
                console.log('   Meta:', JSON.stringify(log.meta).substring(0, 150) + '...');
            } catch (e) {
                console.log('   Meta: (erro ao stringify)');
            }
        }
    });
}

checkRecentLogs();
