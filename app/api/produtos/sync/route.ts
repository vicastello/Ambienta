import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  listarProdutos,
  obterEstoqueProduto,
  obterProduto,
  TinyProdutoListaItem,
  TinyEstoqueProduto,
} from '@/lib/tinyApi';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      limit = 100,
      enrichEstoque = true, // Se true, busca estoque detalhado de cada produto
    } = body;

    // 1. Buscar token do Tiny
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: tokenData, error: tokenError } = await supabase
      .from('tiny_tokens')
      .select('access_token')
      .single();

    if (tokenError || !tokenData?.access_token) {
      return NextResponse.json(
        { error: 'Token do Tiny não encontrado' },
        { status: 401 }
      );
    }

    const accessToken = tokenData.access_token;

    // 2. Listar produtos do Tiny
    console.log('[Sync Produtos] Iniciando sincronização...');
    let offset = 0;
    let totalSincronizados = 0;
    let totalNovos = 0;
    let totalAtualizados = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await listarProdutos(accessToken, {
        limit,
        offset,
        situacao: 'A', // Apenas produtos ativos
      });

      if (!response.itens || response.itens.length === 0) {
        hasMore = false;
        break;
      }

      console.log(
        `[Sync Produtos] Processando ${response.itens.length} produtos (offset: ${offset})...`
      );

      // 3. Processar cada produto
      for (const produto of response.itens) {
        try {
          // 3.1 Buscar detalhes do produto para obter imagem
          let produtoDetalhado: any = null;
          try {
            produtoDetalhado = await obterProduto(accessToken, produto.id);
            await new Promise((resolve) => setTimeout(resolve, 150));
          } catch (error) {
            console.warn(
              `[Sync Produtos] Erro ao buscar detalhes do produto ${produto.id}:`,
              error
            );
          }

          // 3.2 Buscar estoque detalhado se solicitado
          let estoqueDetalhado: TinyEstoqueProduto | null = null;
          if (enrichEstoque) {
            try {
              estoqueDetalhado = await obterEstoqueProduto(accessToken, produto.id);
              // Pequeno delay para evitar rate limit
              await new Promise((resolve) => setTimeout(resolve, 150));
            } catch (error) {
              console.warn(
                `[Sync Produtos] Erro ao buscar estoque do produto ${produto.id}:`,
                error
              );
            }
          }

          // 3.3 Extrair primeira imagem
          const primeiraImagem = produtoDetalhado?.anexos?.find((anexo: any) => anexo.url);

          // 3.4 Preparar dados para inserir/atualizar
          const produtoData = {
            id_produto_tiny: produto.id,
            codigo: produto.sku || null,
            nome: produto.descricao,
            unidade: produto.unidade || null,
            preco: produto.precos?.preco || null,
            preco_promocional: produto.precos?.precoPromocional || null,
            situacao: produto.situacao,
            tipo: produto.tipo,
            gtin: produto.gtin || null,
            imagem_url: primeiraImagem?.url || null,
            // Estoque da listagem ou detalhado
            saldo: estoqueDetalhado?.saldo ?? null,
            reservado: estoqueDetalhado?.reservado ?? null,
            disponivel: estoqueDetalhado?.disponivel ?? null,
            data_criacao_tiny: produto.dataCriacao || null,
            data_atualizacao_tiny: produto.dataAlteracao || null,
          };

          // 3.5 Upsert no banco (INSERT ou UPDATE se já existe)
          const { error: upsertError } = await supabase
            .from('tiny_produtos')
            .upsert(produtoData, {
              onConflict: 'id_produto_tiny',
              ignoreDuplicates: false,
            });

          if (upsertError) {
            console.error(
              `[Sync Produtos] Erro ao salvar produto ${produto.id}:`,
              upsertError
            );
          } else {
            // Verificar se foi inserção ou atualização
            const { data: existing } = await supabase
              .from('tiny_produtos')
              .select('id')
              .eq('id_produto_tiny', produto.id)
              .single();

            if (existing) {
              totalAtualizados++;
            } else {
              totalNovos++;
            }
            totalSincronizados++;
          }
        } catch (error) {
          console.error(
            `[Sync Produtos] Erro ao processar produto ${produto.id}:`,
            error
          );
        }
      }

      // 4. Próxima página
      offset += limit;

      // Verificar se há mais páginas
      if (response.paginacao?.total) {
        hasMore = offset < response.paginacao.total;
      } else {
        // Se não retornou total, verifica se veio menos que o limit
        hasMore = response.itens.length >= limit;
      }

      // Delay entre páginas
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(
      `[Sync Produtos] Finalizado: ${totalSincronizados} produtos (${totalNovos} novos, ${totalAtualizados} atualizados)`
    );

    return NextResponse.json({
      success: true,
      totalSincronizados,
      totalNovos,
      totalAtualizados,
    });
  } catch (error: any) {
    console.error('[Sync Produtos] Erro:', error);
    return NextResponse.json(
      {
        error: error?.message || 'Erro ao sincronizar produtos',
      },
      { status: 500 }
    );
  }
}

// GET para status
export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { count, error } = await supabase
      .from('tiny_produtos')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    return NextResponse.json({
      totalProdutos: count || 0,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao consultar produtos' },
      { status: 500 }
    );
  }
}
