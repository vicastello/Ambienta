// app/api/produtos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const situacao = searchParams.get('situacao') || 'A';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let query = supabase
      .from('tiny_produtos')
      .select('*', { count: 'exact' })
      .order('nome', { ascending: true });

    // Filtros
    if (situacao && situacao !== 'all') {
      query = query.eq('situacao', situacao);
    }

    if (search) {
      query = query.or(
        `nome.ilike.%${search}%,codigo.ilike.%${search}%,gtin.ilike.%${search}%`
      );
    }

    // Paginação
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      produtos: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error('[API Produtos] Erro:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao buscar produtos' },
      { status: 500 }
    );
  }
}
