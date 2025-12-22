// API route for managing order tags and available tags
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Cast to any for new tables until types are regenerated after migration
const db = supabaseAdmin as any;

// GET: Fetch available tags for suggestions
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const orderId = searchParams.get('orderId');

        if (orderId) {
            // Get tags for a specific order
            const { data, error } = await db
                .from('order_tags')
                .select('tag_name')
                .eq('order_id', parseInt(orderId));

            if (error) throw error;
            return NextResponse.json({ tags: data?.map((t: any) => t.tag_name) || [] });
        }

        // Get all available tags for suggestions from multiple sources
        const allTags = new Map<string, { name: string; color: string | null; usage_count: number }>();

        // 1. Get tags from available_tags table
        const { data: availableData } = await db
            .from('available_tags')
            .select('id, name, color, usage_count')
            .order('usage_count', { ascending: false })
            .limit(100);

        if (availableData) {
            availableData.forEach((tag: any) => {
                allTags.set(tag.name, { name: tag.name, color: tag.color, usage_count: tag.usage_count || 0 });
            });
        }

        // 2. Get tags from order_tags table (manually added)
        const { data: orderTagsData } = await db
            .from('order_tags')
            .select('tag_name');

        if (orderTagsData) {
            const tagCounts = new Map<string, number>();
            orderTagsData.forEach((t: any) => {
                tagCounts.set(t.tag_name, (tagCounts.get(t.tag_name) || 0) + 1);
            });
            tagCounts.forEach((count, name) => {
                if (!allTags.has(name)) {
                    allTags.set(name, { name, color: null, usage_count: count });
                } else {
                    const existing = allTags.get(name)!;
                    existing.usage_count = Math.max(existing.usage_count, count);
                }
            });
        }

        // 3. Get tags from marketplace_payments (from imports)
        const { data: paymentTags } = await db
            .from('marketplace_payments')
            .select('tags')
            .not('tags', 'is', null);

        if (paymentTags) {
            const tagCounts = new Map<string, number>();
            paymentTags.forEach((p: any) => {
                if (p.tags && Array.isArray(p.tags)) {
                    p.tags.forEach((tag: string) => {
                        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                    });
                }
            });
            tagCounts.forEach((count, name) => {
                if (!allTags.has(name)) {
                    allTags.set(name, { name, color: '#f59e0b', usage_count: count }); // amber for import tags
                } else {
                    const existing = allTags.get(name)!;
                    existing.usage_count = Math.max(existing.usage_count, count);
                }
            });
        }

        // Sort by usage and return
        const sortedTags = Array.from(allTags.values())
            .sort((a, b) => b.usage_count - a.usage_count)
            .slice(0, 50);

        return NextResponse.json({ tags: sortedTags });
    } catch (error: any) {
        console.error('[tags] Error:', error);
        return NextResponse.json({ error: 'Erro ao buscar tags' }, { status: 500 });
    }
}

// POST: Add tag to order
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { orderId, tagName } = body;

        if (!orderId || !tagName) {
            return NextResponse.json({ error: 'orderId e tagName são obrigatórios' }, { status: 400 });
        }

        const trimmedTag = tagName.trim();

        // Add tag to order
        const { error: orderTagError } = await db
            .from('order_tags')
            .upsert({
                order_id: orderId,
                tag_name: trimmedTag
            }, { onConflict: 'order_id,tag_name' });

        if (orderTagError) throw orderTagError;

        // Add/update available tag (increment usage count)
        const { data: existingTag } = await db
            .from('available_tags')
            .select('id, usage_count')
            .eq('name', trimmedTag)
            .single();

        if (existingTag) {
            await db
                .from('available_tags')
                .update({ usage_count: (existingTag.usage_count || 0) + 1 })
                .eq('id', existingTag.id);
        } else {
            await db
                .from('available_tags')
                .insert({ name: trimmedTag, usage_count: 1 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[tags] Error adding tag:', error);
        return NextResponse.json({ error: 'Erro ao adicionar tag' }, { status: 500 });
    }
}

// DELETE: Remove tag from order
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const orderId = searchParams.get('orderId');
        const tagName = searchParams.get('tagName');

        if (!orderId || !tagName) {
            return NextResponse.json({ error: 'orderId e tagName são obrigatórios' }, { status: 400 });
        }

        const { error } = await db
            .from('order_tags')
            .delete()
            .eq('order_id', parseInt(orderId))
            .eq('tag_name', tagName);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[tags] Error removing tag:', error);
        return NextResponse.json({ error: 'Erro ao remover tag' }, { status: 500 });
    }
}
