/**
 * Script para fazer a carga inicial de produtos do Tiny ERP
 * 
 * Uso:
 *   npx tsx scripts/syncProdutosInitial.ts
 */

import { createClient } from "@supabase/supabase-js";
import { listarProdutos, obterEstoqueProduto, obterProduto } from "../lib/tinyApi";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Variáveis de ambiente do Supabase não configuradas");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface SyncStats {
  totalSincronizados: number;
  totalNovos: number;
  totalAtualizados: number;
  erros: number;
}

async function syncProdutos(enrichEstoque = true): Promise<SyncStats> {
  console.log("🔍 Buscando token de acesso...");

  // Buscar token do Tiny
  const { data: tokenData, error: tokenError } = await supabase
    .from("tiny_tokens")
    .select("access_token")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (tokenError || !tokenData?.access_token) {
    throw new Error("Token de acesso não encontrado. Faça login no Tiny primeiro.");
  }

  const accessToken = tokenData.access_token;

  const stats: SyncStats = {
    totalSincronizados: 0,
    totalNovos: 0,
    totalAtualizados: 0,
    erros: 0,
  };

  let offset = 0;
  const limit = 100;
  let hasMore = true;

  console.log(`🚀 Iniciando sincronização de produtos (enriquecimento de estoque: ${enrichEstoque ? "SIM" : "NÃO"})\n`);

  while (hasMore) {
    try {
      console.log(`📦 Buscando página ${Math.floor(offset / limit) + 1} (offset: ${offset})...`);

      const response = await listarProdutos(accessToken, {
        limit,
        offset,
        situacao: "A", // Apenas produtos ativos
      });

      const produtos = response?.itens || [];

      if (!produtos || produtos.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`   └─ ${produtos.length} produtos encontrados`);

      for (const produto of produtos) {
        try {
          // Verificar se produto já existe e se foi atualizado no Tiny
          const { data: produtoExistente } = await supabase
            .from("tiny_produtos")
            .select("id_produto_tiny, data_atualizacao_tiny")
            .eq("id_produto_tiny", produto.id)
            .single();

          // Se produto existe e não foi atualizado no Tiny, pular
          if (produtoExistente && produto.dataAlteracao) {
            const dataExistente = new Date(produtoExistente.data_atualizacao_tiny);
            const dataTiny = new Date(produto.dataAlteracao);
            
            if (dataExistente >= dataTiny) {
              // Produto já está atualizado, pular
              stats.totalSincronizados++;
              continue;
            }
          }

          let estoqueData: any = null;
          let produtoDetalhado: any = null;

          // Buscar detalhes do produto para pegar imagem
          try {
            produtoDetalhado = await obterProduto(accessToken, produto.id);
            await new Promise((resolve) => setTimeout(resolve, 200)); // Rate limit
          } catch (detailError) {
            console.warn(`   ⚠️  Erro ao buscar detalhes do produto ${produto.id}: ${detailError}`);
          }

          // Enriquecer com dados de estoque se solicitado
          if (enrichEstoque) {
            try {
              estoqueData = await obterEstoqueProduto(accessToken, produto.id);
              await new Promise((resolve) => setTimeout(resolve, 300)); // Rate limit aumentado
            } catch (estoqueError) {
              console.warn(`   ⚠️  Erro ao buscar estoque do produto ${produto.id}: ${estoqueError}`);
            }
          }

          // Extrair primeira imagem (capa)
          const primeiraImagem = produtoDetalhado?.anexos?.find((anexo: any) => anexo.url);

          // Preparar dados para inserção
          const produtoData = {
            id_produto_tiny: produto.id,
            codigo: produto.sku || null,
            nome: produto.descricao,
            unidade: produto.unidade || null,
            preco: produto.precos?.preco || null,
            preco_promocional: produto.precos?.precoPromocional || null,
            saldo: estoqueData?.estoque?.saldo || 0,
            reservado: estoqueData?.estoque?.reservado || 0,
            disponivel: estoqueData?.estoque?.disponivel || 0,
            situacao: produto.situacao,
            tipo: produto.tipo,
            gtin: produto.gtin || null,
            imagem_url: primeiraImagem?.url || null,
            data_criacao_tiny: produto.dataCriacao || null,
            data_atualizacao_tiny: produto.dataAlteracao || null,
          };

          // Upsert no banco
          const { error: upsertError } = await supabase
            .from("tiny_produtos")
            .upsert(produtoData, {
              onConflict: "id_produto_tiny",
              ignoreDuplicates: false,
            });

          if (upsertError) {
            console.error(`   ❌ Erro ao salvar produto ${produto.id}:`, upsertError);
            stats.erros++;
          } else {
            stats.totalSincronizados++;
            
            // Verificar se é novo ou atualizado
            const { count } = await supabase
              .from("tiny_produtos")
              .select("*", { count: "exact", head: true })
              .eq("id_produto_tiny", produto.id);

            if (count === 1) {
              stats.totalNovos++;
            } else {
              stats.totalAtualizados++;
            }
          }
        } catch (produtoError: any) {
          console.error(`   ❌ Erro ao processar produto ${produto.id}:`, produtoError);
          stats.erros++;
        }
      }

      console.log(`   ✅ Página processada: ${stats.totalSincronizados} produtos sincronizados\n`);

      offset += limit;

      // Rate limit entre páginas (aumentado para evitar 429)
      await new Promise((resolve) => setTimeout(resolve, 2000));

    } catch (pageError: any) {
      console.error(`❌ Erro ao processar página (offset ${offset}):`, pageError);
      stats.erros++;
      break;
    }
  }

  return stats;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  CARGA INICIAL DE PRODUTOS DO TINY ERP");
  console.log("═══════════════════════════════════════════════════════\n");

  const startTime = Date.now();

  try {
    // Verificar se as tabelas existem
    console.log("🔍 Verificando estrutura do banco...");
    const { error: tableError } = await supabase
      .from("tiny_produtos")
      .select("id")
      .limit(1);

    if (tableError) {
      console.error("\n❌ ERRO: Tabela 'tiny_produtos' não encontrada!");
      console.error("Execute a migração 011_create_produtos_tables.sql primeiro.\n");
      console.error("Acesse: https://znoiauhdrujwkfryhwiz.supabase.co");
      console.error("Vá em SQL Editor e execute o arquivo migrations/011_create_produtos_tables.sql\n");
      process.exit(1);
    }

    console.log("✅ Estrutura do banco OK\n");

    // Executar sincronização (COM busca de imagens)
    const stats = await syncProdutos(false); // false = sem enriquecimento de estoque (mais rápido)

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  RESULTADO DA SINCRONIZAÇÃO");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`✅ Total sincronizado: ${stats.totalSincronizados} produtos`);
    console.log(`🆕 Novos produtos: ${stats.totalNovos}`);
    console.log(`🔄 Produtos atualizados: ${stats.totalAtualizados}`);
    if (stats.erros > 0) {
      console.log(`❌ Erros: ${stats.erros}`);
    }
    console.log(`⏱️  Tempo total: ${duration}s`);
    console.log("═══════════════════════════════════════════════════════\n");

    process.exit(stats.erros > 0 ? 1 : 0);
  } catch (error: any) {
    console.error("\n❌ ERRO FATAL:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
