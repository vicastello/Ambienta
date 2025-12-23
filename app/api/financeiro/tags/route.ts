import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const orderId = searchParams.get('orderId');

        // If orderId is provided, return only tags for that specific order
        if (orderId) {
            const orderIdNum = parseInt(orderId);
            const orderTags: string[] = [];

            // 1. Get tags from order_tags table for this order
            const { data: orderTagsData } = await supabaseAdmin
                .from('order_tags')
                .select('tag_name')
                .eq('order_id', orderIdNum);

            if (orderTagsData) {
                orderTagsData.forEach((t: { tag_name: string }) => orderTags.push(t.tag_name));
            }

            // 2. Get tags from marketplace_payments linked to this order
            const { data: paymentData } = await supabaseAdmin
                .from('marketplace_payments')
                .select('tags')
                .eq('tiny_order_id', orderIdNum)
                .not('tags', 'is', null);

            if (paymentData) {
                paymentData.forEach((p: { tags: string[] | null }) => {
                    if (p.tags && Array.isArray(p.tags)) {
                        p.tags.forEach(tag => {
                            if (!orderTags.includes(tag)) {
                                orderTags.push(tag);
                            }
                        });
                    }
                });
            }

            return NextResponse.json({ tags: orderTags });
        }

        // No orderId - return all available tags (for filter dropdown)
        const allTags = new Set<string>();

        // 1. Get tags from order_tags table
        const { data: orderTags } = await supabaseAdmin
            .from('order_tags')
            .select('tag_name');

        if (orderTags) {
            orderTags.forEach((t: { tag_name: string }) => allTags.add(t.tag_name));
        }

        // 2. Get tags from available_tags table
        const { data: availableTags } = await supabaseAdmin
            .from('available_tags')
            .select('name');

        if (availableTags) {
            availableTags.forEach((t: { name: string }) => allTags.add(t.name));
        }

        // 3. Get unique tags from marketplace_payments.tags array
        const { data: paymentTags } = await supabaseAdmin
            .from('marketplace_payments')
            .select('tags')
            .not('tags', 'is', null);

        if (paymentTags) {
            paymentTags.forEach((p: { tags: string[] | null }) => {
                if (p.tags && Array.isArray(p.tags)) {
                    p.tags.forEach(tag => allTags.add(tag));
                }
            });
        }

        // 4. Get unique tags from cash_flow_entries.tags array
        const { data: cashFlowTags } = await supabaseAdmin
            .from('cash_flow_entries')
            .select('tags')
            .not('tags', 'is', null);

        if (cashFlowTags) {
            cashFlowTags.forEach((c: { tags: string[] | null }) => {
                if (c.tags && Array.isArray(c.tags)) {
                    c.tags.forEach(tag => allTags.add(tag));
                }
            });
        }

        // Sort and return unique tags
        const uniqueTags = [...allTags].sort((a, b) => a.localeCompare(b, 'pt-BR'));

        return NextResponse.json({ tags: uniqueTags });
    } catch (err) {
        console.error('[Tags API] Error:', err);
        return NextResponse.json({ tags: [] });
    }
}

