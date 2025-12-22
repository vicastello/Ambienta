import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('/Users/vitorcastello/projetos/gestor-tiny/.env.vercel', 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) envVars[m[1]] = m[2].replace(/^["']|["']$/g, '');
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function checkOrder() {
    const orderSn = '2512112JCVABGT';

    // Verificar no link e no Tiny
    const { data: linkData } = await supabase
        .from('marketplace_order_links')
        .select(`
            tiny_order_id,
            tiny_orders!inner(id, numero_pedido, valor, valor_total_pedido, valor_frete)
        `)
        .eq('marketplace_order_id', orderSn)
        .maybeSingle();

    console.log('=== Link/Tiny para pedido', orderSn, '===');
    if (linkData) {
        const tiny = (linkData as any).tiny_orders;
        console.log('tiny_order_id:', linkData.tiny_order_id);
        console.log('numero_pedido:', tiny.numero_pedido);
        console.log('valor:', tiny.valor);
        console.log('valor_total_pedido:', tiny.valor_total_pedido);
        console.log('valor_frete:', tiny.valor_frete);
        console.log('');
        const valorProdutos = (tiny.valor || tiny.valor_total_pedido || 0) - (tiny.valor_frete || 0);
        console.log('Valor produtos (sem frete):', valorProdutos);
    } else {
        console.log('Pedido não vinculado ao Tiny');
    }
}

checkOrder().catch(console.error);
