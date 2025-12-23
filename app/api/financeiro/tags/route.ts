import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
    try {
        // Get all unique tags from order_tags
        const { data, error } = await supabaseAdmin
            .from('order_tags')
            .select('tag_name')
            .order('tag_name');

        if (error) {
            console.error('[Tags API] Error fetching tags:', error);
            return NextResponse.json({ tags: [] });
        }

        // Get unique tag names
        const uniqueTags = [...new Set(data?.map((t: { tag_name: string }) => t.tag_name) || [])];

        return NextResponse.json({ tags: uniqueTags });
    } catch (err) {
        console.error('[Tags API] Error:', err);
        return NextResponse.json({ tags: [] });
    }
}
