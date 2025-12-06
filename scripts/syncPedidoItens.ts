/**
 * Script para sincronizar itens dos pedidos existentes
 * 
 * Este script:
 * 1. Busca todos os pedidos já sincronizados no banco
 * 2. Para cada pedido, busca os detalhes da API do Tiny (GET /pedidos/{id})
 * 3. Extrai os itens e salva na tabela tiny_pedido_itens
 * 4. Respeita o limite de 100 requisições/minuto (600ms entre chamadas)
 * 
 * Uso:
 *   npx tsx scripts/syncPedidoItens.ts
 */

import { createClient } from "@supabase/supabase-js";
import { obterPedidoDetalhado } from "../lib/tinyApi";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Variáveis de ambiente do Supabase não configuradas");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface SyncStats {
  totalPedidos: number;
  totalItens: number;
  pedidosComItens: number;
  pedidosSemItens: number;
  erros: number;
}

async function syncPedidoItens(): Promise<SyncStats> {
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
    totalPedidos: 0,
    totalItens: 0,
    pedidosComItens: 0,
    pedidosSemItens: 0,
    erros: 0,
  };

  console.log("🚀 Buscando pedidos para sincronizar itens...\n");

  // Buscar pedidos que ainda não têm itens salvos
  const { data: pedidos, error: pedidosError } = await supabase
    .from("tiny_orders")
    .select("id, tiny_id")
    .order("id", { ascending: true });

  if (pedidosError || !pedidos) {
    throw new Error(`Erro ao buscar pedidos: ${pedidosError?.message}`);
  }

  // Filtrar apenas pedidos sem itens
  const { data: pedidosComItens } = await supabase
    .from("tiny_pedido_itens")
    .select("id_pedido");

  const idsComItens = new Set(pedidosComItens?.map(p => p.id_pedido) || []);
  const pedidosSemItens = pedidos.filter(p => !idsComItens.has(p.id));

  console.log(`📦 Total: ${pedidos.length} pedidos`);
  console.log(`✅ Já processados: ${idsComItens.size} pedidos`);
  console.log(`⏳ Faltam: ${pedidosSemItens.length} pedidos\n`);
  
  stats.totalPedidos = pedidosSemItens.length;

  // Processar cada pedido sem itens
  const pedidosParaProcessar = pedidosSemItens;
  for (let i = 0; i < pedidosParaProcessar.length; i++) {
    const pedido = pedidosParaProcessar[i];
    
    try {
      console.log(`[${i + 1}/${pedidosParaProcessar.length}] Processando pedido ${pedido.tiny_id}...`);

      // Buscar detalhes do pedido na API
      const pedidoDetalhado = await obterPedidoDetalhado(
        accessToken,
        pedido.tiny_id,
        'pedido_helper'
      );

      // Extrair itens
      const itens = pedidoDetalhado.itens || [];

      if (itens.length === 0) {
        console.log(`   ⚠️  Pedido sem itens`);
        stats.pedidosSemItens++;
      } else {
        // Salvar itens no banco
        const itensParaSalvar = itens.map((item) => ({
          id_pedido: pedido.id,
          id_produto_tiny: item.idProduto || null,
          codigo_produto: item.codigo || null,
          nome_produto: item.descricao || "Sem descrição",
          quantidade: item.quantidade || 0,
          valor_unitario: item.valorUnitario || 0,
          valor_total: item.valorTotal || 0,
          info_adicional: item.informacoesAdicionais || null,
        }));

        // Inserir itens (script já filtra pedidos sem itens)
        const { error: insertError } = await supabase
          .from("tiny_pedido_itens")
          .insert(itensParaSalvar);

        if (insertError) {
          console.error(`   ❌ Erro ao salvar itens: ${insertError.message}`);
          stats.erros++;
        } else {
          console.log(`   ✅ ${itens.length} itens salvos`);
          stats.totalItens += itens.length;
          stats.pedidosComItens++;
        }
      }

      // Rate limit: 600ms entre requisições = ~100 req/min
      await new Promise((resolve) => setTimeout(resolve, 600));

    } catch (error: any) {
      console.error(`   ❌ Erro ao processar pedido ${pedido.tiny_id}:`, error.message);
      stats.erros++;
      
      // Se for erro 429 (rate limit), aguardar mais tempo
      if (error.status === 429) {
        console.log(`   ⏸️  Rate limit atingido, aguardando 5 segundos...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  return stats;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  SINCRONIZAÇÃO DE ITENS DOS PEDIDOS");
  console.log("═══════════════════════════════════════════════════════\n");

  const startTime = Date.now();

  try {
    const stats = await syncPedidoItens();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  RESULTADO DA SINCRONIZAÇÃO");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`📦 Total de pedidos: ${stats.totalPedidos}`);
    console.log(`✅ Pedidos com itens sincronizados: ${stats.pedidosComItens}`);
    console.log(`🔢 Total de itens salvos: ${stats.totalItens}`);
    console.log(`⚠️  Pedidos sem itens: ${stats.pedidosSemItens}`);
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
