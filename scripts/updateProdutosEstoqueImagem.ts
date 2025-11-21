/**
 * Atualizar TODOS os produtos com estoque e imagens de capa
 * 
 * Busca informações atualizadas do Tiny ERP:
 * - Estoque detalhado (saldo, reservado, disponível)
 * - Primeira imagem/anexo como imagem de capa
 */

import { createClient } from "@supabase/supabase-js";
import { obterProduto, obterEstoqueProduto } from "../lib/tinyApi";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Variáveis de ambiente do Supabase não configuradas");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface UpdateStats {
  totalProcessados: number;
  comEstoque: number;
  comImagem: number;
  erros: number;
}

async function atualizarProdutos(limit: number = 1000): Promise<UpdateStats> {
  console.log("🔍 Buscando token de acesso...");

  const { data: tokenData, error: tokenError } = await supabase
    .from("tiny_tokens")
    .select("access_token")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (tokenError || !tokenData?.access_token) {
    throw new Error("Token de acesso não encontrado.");
  }

  const accessToken = tokenData.access_token;

  const stats: UpdateStats = {
    totalProcessados: 0,
    comEstoque: 0,
    comImagem: 0,
    erros: 0,
  };

  // Buscar todos os produtos do banco (priorizando os que precisam de atualização)
  console.log(`📦 Carregando produtos do banco (limite: ${limit})...\n`);
  
  const { data: produtos, error: produtosError } = await supabase
    .from("tiny_produtos")
    .select("id, id_produto_tiny, codigo, nome, saldo, imagem_url")
    .or("saldo.is.null,imagem_url.is.null,saldo.eq.0") // Priorizar produtos sem estoque ou imagem
    .limit(limit);

  if (produtosError || !produtos) {
    throw new Error(`Erro ao carregar produtos: ${produtosError?.message}`);
  }

  console.log(`✅ ${produtos.length} produtos carregados (priorizados os que precisam atualização)\n`);
  console.log("🚀 Iniciando atualização...\n");

  let requestCount = 0;
  const maxRequestsPerMinute = 90; // Margem de segurança (limite é 100)
  let minuteStartTime = Date.now();

  for (const produto of produtos) {
    try {
      // Controle de rate limit: máximo 90 requisições por minuto
      if (requestCount >= maxRequestsPerMinute) {
        const elapsed = Date.now() - minuteStartTime;
        if (elapsed < 60000) {
          const waitTime = 60000 - elapsed;
          console.log(`\n⏸️  Rate limit: Aguardando ${(waitTime / 1000).toFixed(0)}s antes de continuar...\n`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
        // Resetar contadores
        requestCount = 0;
        minuteStartTime = Date.now();
      }

      // 1. Buscar detalhes do produto (para imagem)
      let produtoDetalhado: any = null;
      try {
        produtoDetalhado = await obterProduto(accessToken, produto.id_produto_tiny);
        requestCount++;
        await new Promise((resolve) => setTimeout(resolve, 700)); // 700ms entre requisições
      } catch (err: any) {
        console.warn(`   ⚠️  ${produto.id_produto_tiny} | Erro ao buscar detalhes: ${err.message}`);
      }

      // 2. Buscar estoque
      let estoqueData: any = null;
      try {
        estoqueData = await obterEstoqueProduto(accessToken, produto.id_produto_tiny);
        requestCount++;
        await new Promise((resolve) => setTimeout(resolve, 700)); // 700ms entre requisições
      } catch (err: any) {
        console.warn(`   ⚠️  ${produto.id_produto_tiny} | Erro ao buscar estoque: ${err.message}`);
      }

      // 3. Extrair primeira imagem
      const primeiraImagem = produtoDetalhado?.anexos?.find((a: any) => a.url);
      const imagemUrl = primeiraImagem?.url || null;

      // 4. Atualizar no banco
      const updateData: any = {};
      
      if (estoqueData) {
        updateData.saldo = estoqueData.saldo || 0;
        updateData.reservado = estoqueData.reservado || 0;
        updateData.disponivel = estoqueData.disponivel || 0;
        stats.comEstoque++;
      }

      if (imagemUrl) {
        updateData.imagem_url = imagemUrl;
        stats.comImagem++;
      }

      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from("tiny_produtos")
          .update(updateData)
          .eq("id", produto.id);

        if (updateError) {
          console.error(`   ❌ ${produto.id_produto_tiny} | Erro ao atualizar: ${updateError.message}`);
          stats.erros++;
        } else {
          const estoqueStr = estoqueData ? `📊 ${estoqueData.saldo}` : "";
          const imagemStr = imagemUrl ? "🖼️ " : "";
          console.log(`   ✅ ${produto.id_produto_tiny} | ${produto.codigo} | ${imagemStr}${estoqueStr}`);
        }
      }

      stats.totalProcessados++;

      // Progress report a cada 50 produtos
      if (stats.totalProcessados % 50 === 0) {
        console.log(`\n📈 Progresso: ${stats.totalProcessados}/${produtos.length} | Estoque: ${stats.comEstoque} | Imagens: ${stats.comImagem}\n`);
      }

    } catch (err: any) {
      console.error(`   ❌ ${produto.id_produto_tiny} | Erro geral: ${err.message}`);
      stats.erros++;
    }
  }

  return stats;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  ATUALIZAÇÃO: ESTOQUE E IMAGENS DE PRODUTOS");
  console.log("═══════════════════════════════════════════════════════\n");

  const startTime = Date.now();

  try {
    const stats = await atualizarProdutos(1200); // Processar todos os produtos

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  RESULTADO");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`✅ Produtos processados: ${stats.totalProcessados}`);
    console.log(`📊 Com estoque atualizado: ${stats.comEstoque}`);
    console.log(`🖼️  Com imagem capturada: ${stats.comImagem}`);
    if (stats.erros > 0) {
      console.log(`❌ Erros: ${stats.erros}`);
    }
    console.log(`⏱️  Tempo total: ${duration} minutos`);
    console.log("═══════════════════════════════════════════════════════\n");

    process.exit(stats.erros > 0 ? 1 : 0);
  } catch (error: any) {
    console.error("\n❌ ERRO FATAL:", error.message);
    process.exit(1);
  }
}

main();

export {};
