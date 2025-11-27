/**
 * Job automático de sincronização de produtos
 * 
 * Sincroniza produtos ativos do Tiny ERP periodicamente (recomendado: a cada 6 horas)
 * Atualiza preços, estoque e imagens
 * 
 * Para agendar via cron no servidor:
 *   0 *\/6 * * * cd /path/to/project && npx tsx scripts/jobSyncProdutos.ts
 */

import { createClient } from "@supabase/supabase-js";
import { listarProdutos, obterEstoqueProduto } from "../lib/tinyApi";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Variáveis de ambiente do Supabase não configuradas");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface JobStats {
  totalProcessados: number;
  novos: number;
  atualizados: number;
  erros: number;
}

async function syncProdutosJob(
  maxProdutos: number = Number.POSITIVE_INFINITY,
  enrichEstoque: boolean = true
): Promise<JobStats> {
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

  const stats: JobStats = {
    totalProcessados: 0,
    novos: 0,
    atualizados: 0,
    erros: 0,
  };

  let offset = 0;
  const limit = 100;

  const forceFullSync = process.env.FORCE_FULL_SYNC === "1" || process.env.FORCE_FULL_SYNC === "true";

  // Busca última atualização conhecida para evitar refetch completo (a menos que forceFullSync)
  const { data: lastUpdatedRow } = await supabase
    .from("tiny_produtos")
    .select("data_atualizacao_tiny")
    .order("data_atualizacao_tiny", { ascending: false })
    .limit(1)
    .maybeSingle();

  let dataAlteracao: string | undefined = undefined;
  if (!forceFullSync && lastUpdatedRow?.data_atualizacao_tiny) {
    const base = new Date(lastUpdatedRow.data_atualizacao_tiny);
    // margem de segurança de 12h para não perder eventos
    base.setHours(base.getHours() - 12);
    dataAlteracao = base.toISOString().replace('T', ' ').slice(0, 19);
    console.log(`⏱️  Usando dataAlteracao >= ${dataAlteracao} para reduzir chamadas`);
  } else if (forceFullSync) {
    console.log("⏱️  Full sync forçado: ignorando dataAlteracao");
  }

  console.log(`🚀 Sincronizando produtos (estoque: ${enrichEstoque ? "SIM" : "NÃO"})\n`);

  while (true) {
    try {
      console.log(`📦 Página ${Math.floor(offset / limit) + 1}...`);

      const response = await listarProdutos(accessToken, {
        limit,
        offset,
        situacao: "A", // Apenas ativos
        dataAlteracao,
      });

      const produtos = response?.itens || [];

      if (produtos.length === 0) break;

      for (const produto of produtos) {
        if (stats.totalProcessados >= maxProdutos) break;

        try {
          // Buscar estoque se solicitado
          let estoqueData: any = null;
          if (enrichEstoque) {
            const delayEstoqueMs = Number(process.env.DELAY_ESTOQUE_MS || 700);
            try {
              let tentativa = 0;
              while (tentativa < 3) {
                try {
                  estoqueData = await obterEstoqueProduto(accessToken, produto.id);
                  break;
                } catch (err: any) {
                  if (err.status === 429) {
                    const waitMs = 8000 * (tentativa + 1);
                    console.warn(`   ⏸️  Rate limit estoque ${produto.id}, aguardando ${waitMs / 1000}s...`);
                    await new Promise((r) => setTimeout(r, waitMs));
                    tentativa++;
                    continue;
                  }
                  throw err;
                }
              }
              await new Promise((resolve) => setTimeout(resolve, delayEstoqueMs));
            } catch (err) {
              console.warn(`   ⚠️  Erro ao buscar estoque ${produto.id}`);
            }
          }

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
            imagem_url: null,
            data_criacao_tiny: produto.dataCriacao || null,
            data_atualizacao_tiny: produto.dataAlteracao || null,
          };

          // Verificar se já existe
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
            console.error(`   ❌ ${produto.id}: ${upsertError.message}`);
            stats.erros++;
          } else {
            if (existente) {
              stats.atualizados++;
            } else {
              stats.novos++;
            }
            stats.totalProcessados++;
          }
        } catch (err: any) {
          console.error(`   ❌ Erro ${produto.id}: ${err.message}`);
          stats.erros++;
        }
      }

      console.log(`   ✅ ${stats.totalProcessados} produtos processados\n`);

      offset += limit;

      if (stats.totalProcessados >= maxProdutos) break;
      await new Promise((resolve) => setTimeout(resolve, Number(process.env.DELAY_PAGINA_MS || 3500)));

    } catch (err: any) {
      console.error(`❌ Erro na página (offset ${offset}): ${err.message}`);
      if (err.status === 429) {
        console.log("   ⏸️  Rate limit, aguardando 15s e tentando novamente...");
        await new Promise((resolve) => setTimeout(resolve, 15000));
        continue; // tenta novamente a mesma página
      }
      stats.erros++;
      break;
    }
  }

  return stats;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  JOB AUTOMÁTICO: SINCRONIZAÇÃO DE PRODUTOS");
  console.log("═══════════════════════════════════════════════════════\n");

  const startTime = Date.now();

  try {
    // Sincronizar 500 produtos por execução COM ESTOQUE
    const max = process.env.MAX_PRODUCTS ? Number(process.env.MAX_PRODUCTS) : Number.POSITIVE_INFINITY;
    const stats = await syncProdutosJob(max, true);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  RESULTADO");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`✅ Processados: ${stats.totalProcessados}`);
    console.log(`🆕 Novos: ${stats.novos}`);
    console.log(`🔄 Atualizados: ${stats.atualizados}`);
    if (stats.erros > 0) {
      console.log(`❌ Erros: ${stats.erros}`);
    }
    console.log(`⏱️  Tempo: ${duration}s`);
    console.log("═══════════════════════════════════════════════════════\n");

    process.exit(stats.erros > 0 ? 1 : 0);
  } catch (error: any) {
    console.error("\n❌ ERRO FATAL:", error.message);
    process.exit(1);
  }
}

main();
