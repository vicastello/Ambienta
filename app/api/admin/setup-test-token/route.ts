import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/admin/setup-test-token
 * Create a test tiny_tokens table and insert a dummy token for testing
 * 
 * AVISO: Isso é apenas para testes! Não use em produção sem autenticação.
 */
export async function POST(req: NextRequest) {
  try {
    // Check if tiny_tokens table exists by trying to query it
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('tiny_tokens')
      .select('id')
      .limit(1);

    if (!checkError) {
      // Table exists, just ensure row 1 exists
      const { data: row, error: getError } = await supabaseAdmin
        .from('tiny_tokens')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (getError) {
        return NextResponse.json(
          { ok: false, message: 'Error checking tiny_tokens', error: getError.message },
          { status: 500 }
        );
      }

      if (row) {
        return NextResponse.json({
          ok: true,
          message: 'tiny_tokens table exists and has data',
          token: {
            id: row.id,
            expires_at: row.expires_at,
          },
        });
      }
    }

    // If table doesn't exist or row 1 doesn't exist, we need to insert dummy token
    // For now, return helpful error message
    return NextResponse.json(
      {
        ok: false,
        message: 'tiny_tokens table not found. Please:',
        instructions: [
          '1. Go to Supabase dashboard > SQL Editor',
          '2. Run the migration from migrations/001_create_sync_tables_and_tiny_tokens.sql',
          '3. Or manually execute the SQL to create the tables',
          '4. Then authenticate with Tiny API to get real tokens',
        ],
        checkError: checkError?.message,
      },
      { status: 404 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: 'Error', error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
