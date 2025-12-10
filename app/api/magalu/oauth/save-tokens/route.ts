import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';

/**
 * API para salvar tokens OAuth do Magalu no .env.local
 * ATENÇÃO: Apenas para desenvolvimento! Em produção, use um banco de dados seguro
 */
export async function POST(req: NextRequest) {
  try {
    const { access_token, refresh_token } = await req.json();

    if (!access_token || !refresh_token) {
      return NextResponse.json(
        { error: 'access_token e refresh_token são obrigatórios' },
        { status: 400 }
      );
    }

    const envPath = join(process.cwd(), '.env.local');

    // Ler arquivo atual
    const envContent = await readFile(envPath, 'utf-8');

    // Substituir tokens
    let newContent = envContent.replace(
      /MAGALU_ACCESS_TOKEN=.*/,
      `MAGALU_ACCESS_TOKEN=${access_token}`
    );
    newContent = newContent.replace(
      /MAGALU_REFRESH_TOKEN=.*/,
      `MAGALU_REFRESH_TOKEN=${refresh_token}`
    );

    // Salvar
    await writeFile(envPath, newContent, 'utf-8');

    console.log('[Magalu] Tokens salvos no .env.local com sucesso!');

    return NextResponse.json({
      success: true,
      message: 'Tokens salvos com sucesso! Reinicie o servidor para aplicar as mudanças.',
    });

  } catch (error) {
    console.error('[Magalu] Erro ao salvar tokens:', error);
    return NextResponse.json(
      {
        error: 'Erro ao salvar tokens',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
