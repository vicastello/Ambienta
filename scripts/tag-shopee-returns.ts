import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env.development.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TAG_NAME = 'devolucao';
const SHOPEE_RETURN_STATUSES = ['TO_RETURN', 'IN_CANCEL', 'CANCELLED'];

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 200;

const chunkArray = <T,>(items: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
};

async function ensureAvailableTag() {
    const { data, error } = await supabase
        .from('available_tags')
        .select('id')
        .eq('name', TAG_NAME)
        .maybeSingle();

    if (error) {
        console.error('Erro ao buscar available_tags:', error);
        return;
    }

    if (!data) {
        const { error: insertError } = await supabase
            .from('available_tags')
            .insert({ name: TAG_NAME, color: '#f97316', usage_count: 0 });

        if (insertError) {
            console.error('Erro ao criar tag em available_tags:', insertError);
        } else {
            console.log(`✓ Tag "${TAG_NAME}" criada em available_tags`);
        }
    }
}

async function tagShopeeReturns() {
    console.log('🏷️ Backfill tags de devolucao (Shopee)...');
    await ensureAvailableTag();

    let offset = 0;
    let totalShopeeOrders = 0;
    let totalLinkedOrders = 0;
    let totalTaggedOrders = 0;

    while (true) {
        const { data: shopeeOrders, error } = await supabase
            .from('shopee_orders')
            .select('order_sn, order_status')
            .in('order_status', SHOPEE_RETURN_STATUSES)
            .order('order_sn', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
            console.error('Erro ao buscar shopee_orders:', error);
            break;
        }

        if (!shopeeOrders || shopeeOrders.length === 0) {
            break;
        }

        totalShopeeOrders += shopeeOrders.length;

        const orderSns = shopeeOrders
            .map(order => order.order_sn)
            .filter(Boolean) as string[];

        const tinyOrderIds: number[] = [];
        const orderSnChunks = chunkArray(orderSns, CHUNK_SIZE);

        for (const chunk of orderSnChunks) {
            const { data: links, error: linksError } = await supabase
                .from('marketplace_order_links')
                .select('tiny_order_id, marketplace_order_id')
                .eq('marketplace', 'shopee')
                .in('marketplace_order_id', chunk);

            if (linksError) {
                console.error('Erro ao buscar marketplace_order_links:', linksError);
                continue;
            }

            if (links) {
                links.forEach(link => {
                    if (link.tiny_order_id) {
                        tinyOrderIds.push(link.tiny_order_id);
                    }
                });
            }
        }

        totalLinkedOrders += tinyOrderIds.length;

        const uniqueTinyOrderIds = [...new Set(tinyOrderIds)];
        if (uniqueTinyOrderIds.length > 0) {
            const existingTaggedIds = new Set<number>();
            const tinyChunks = chunkArray(uniqueTinyOrderIds, CHUNK_SIZE);

            for (const chunk of tinyChunks) {
                const { data: existingTags, error: tagsError } = await supabase
                    .from('order_tags')
                    .select('order_id')
                    .eq('tag_name', TAG_NAME)
                    .in('order_id', chunk);

                if (tagsError) {
                    console.error('Erro ao buscar order_tags:', tagsError);
                    continue;
                }

                existingTags?.forEach(tag => existingTaggedIds.add(tag.order_id));
            }

            const rowsToInsert = uniqueTinyOrderIds
                .filter(orderId => !existingTaggedIds.has(orderId))
                .map(orderId => ({
                    order_id: orderId,
                    tag_name: TAG_NAME,
                }));

            if (rowsToInsert.length > 0) {
                const insertChunks = chunkArray(rowsToInsert, CHUNK_SIZE);
                for (const chunk of insertChunks) {
                    const { error: insertError } = await supabase
                        .from('order_tags')
                        .insert(chunk);

                    if (insertError) {
                        console.error('Erro ao inserir order_tags:', insertError);
                    } else {
                        totalTaggedOrders += chunk.length;
                    }
                }
            }
        }

        console.log(
            `Batch ${offset}-${offset + PAGE_SIZE - 1}: shopee=${shopeeOrders.length}, links=${uniqueTinyOrderIds.length}`
        );

        offset += PAGE_SIZE;
    }

    console.log('✅ Concluido');
    console.log(`  Shopee retornos encontrados: ${totalShopeeOrders}`);
    console.log(`  Pedidos Tiny vinculados: ${totalLinkedOrders}`);
    console.log(`  Tags "${TAG_NAME}" criadas: ${totalTaggedOrders}`);
}

tagShopeeReturns().catch((error) => {
    console.error('Erro inesperado:', error);
});
