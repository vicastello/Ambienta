/**
 * Endpoint de cron job para sincronização automática de produtos
 * 
 * POST /api/admin/cron/sync-produtos
 * 
 * Pode ser agendado via:
 * - Vercel Cron (vercel.json)
 * - Cron externo (curl POST)
 * - Supabase pg_cron
 * 
 * ATENÇÃO: Proteger em produção com autenticação!
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { listarProdutos, obterProduto, obterEstoqueProduto } from "@/lib/tinyApi";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    // TODO: Adicionar autenticação em produção
    // const authHeader = req.headers.get("authorization");
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    console.log("[Cron Produtos] Iniciando job...");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar token
    const { data: tokenData, error: tokenError } = await supabase
      .from("tiny_tokens")
      .select("access_token")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (tokenError || !tokenData?.access_token) {
      return NextResponse.json(
        { error: "Token não encontrado" },
        { status: 500 }
      );
    }

    const accessToken = tokenData.access_token;

    let totalProcessados = 0;
    let novos = 0;
    let atualizados = 0;
    let erros = 0;

    const maxProdutos = 300; // Limite por execução
    const limit = 100;
    let offset = 0;

    while (totalProcessados < maxProdutos) {
      const response = await listarProdutos(accessToken, {
        limit,
        offset,
        situacao: "A",
      });

      const produtos = response?.itens || [];
      if (produtos.length === 0) break;

      for (const produto of produtos) {
        if (totalProcessados >= maxProdutos) break;

        try {
          // Buscar detalhes para imagem
          let produtoDetalhado: any = null;
          try {
            produtoDetalhado = await obterProduto(accessToken, produto.id);
            await new Promise((resolve) => setTimeout(resolve, 300));
          } catch (err) {
            console.warn(`[Cron Produtos] Erro detalhes ${produto.id}`);
          }

          // Buscar estoque
          let estoqueData: any = null;
          try {
            estoqueData = await obterEstoqueProduto(accessToken, produto.id);
            await new Promise((resolve) => setTimeout(resolve, 300));
          } catch (err) {
            console.warn(`[Cron Produtos] Erro estoque ${produto.id}`);
          }

          const primeiraImagem = produtoDetalhado?.anexos?.find(
            (a: any) => a.url
          );

          const produtoData = {
            id_produto_tiny: produto.id,
            codigo: produto.sku || null,
            nome: produto.descricao,
            unidade: produto.unidade || null,
            preco: produto.precos?.preco || null,
            preco_promocional: produto.precos?.precoPromocional || null,
            saldo: estoqueData?.saldo || 0,
            reservado: estoqueData?.reservado || 0,
            disponivel: estoqueData?.disponivel || 0,
            situacao: produto.situacao,
            tipo: produto.tipo,
            gtin: produto.gtin || null,
            imagem_url: primeiraImagem?.url || null,
            data_criacao_tiny: produto.dataCriacao || null,
            data_atualizacao_tiny: produto.dataAlteracao || null,
          };

          const { data: existente } = await supabase
            .from("tiny_produtos")
            .select("id")
            .eq("id_produto_tiny", produto.id)
            .maybeSingle();

          const { error: upsertError } = await supabase
            .from("tiny_produtos")
            .upsert(produtoData, {
              onConflict: "id_produto_tiny",
              ignoreDuplicates: false,
            });

          if (upsertError) {
            console.error(
              `[Cron Produtos] Erro ao salvar ${produto.id}:`,
              upsertError
            );
            erros++;
          } else {
            if (existente) {
              atualizados++;
            } else {
              novos++;
            }
            totalProcessados++;
          }
        } catch (err: any) {
          console.error(`[Cron Produtos] Erro ${produto.id}:`, err.message);
          erros++;
        }
      }

      offset += limit;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log("[Cron Produtos] Job concluído:", {
      totalProcessados,
      novos,
      atualizados,
      erros,
    });

    return NextResponse.json({
      success: true,
      totalProcessados,
      novos,
      atualizados,
      erros,
    });
  } catch (error: any) {
    console.error("[Cron Produtos] Erro fatal:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
