/**
 * Script para forçar sincronização de itens dos pedidos dos últimos N dias
 * 
 * Este script:
 * 1. Busca pedidos criados nos últimos N dias
 * 2. Verifica quais ainda não têm itens sincronizados
 * 3. Para cada pedido sem itens, busca detalhes da API Tiny
 * 4. Extrai e salva os itens na tabela tiny_pedido_itens
 * 5. Respeita rate limit de 100 req/min (600ms entre chamadas)
 * 
 * Uso:
 *   npx tsx scripts/forceSyncItensRecent.ts [dias]
 *   
 * Exemplos:
 *   npx tsx scripts/forceSyncItensRecent.ts     # Últimos 2 dias (padrão)
 *   npx tsx scripts/forceSyncItensRecent.ts 7   # Últimos 7 dias
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
  jaProcessados: number;
  erros: number;
}

async function syncItensRecentes(dias: number): Promise<SyncStats> {
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
    jaProcessados: 0,
    erros: 0,
  };

  // Calcular data mínima
  const dataMinima = new Date();
  dataMinima.setDate(dataMinima.getDate() - dias);
  const dataString = dataMinima.toISOString().split('T')[0];

  console.log(`\n🚀 Buscando pedidos criados desde ${dataString} (últimos ${dias} dias)...\n`);

  // Buscar pedidos recentes
  const { data: pedidos, error: pedidosError } = await supabase
    .from("tiny_orders")
    .select("id, tiny_id, data_criacao, numero_pedido")
    .gte("data_criacao", dataMinima.toISOString())
    .order("data_criacao", { ascending: false });

  if (pedidosError || !pedidos) {
    throw new Error(`Erro ao buscar pedidos: ${pedidosError?.message}`);
  }

  console.log(`📦 Encontrados: ${pedidos.length} pedidos nos últimos ${dias} dias`);

  // Verificar quais já têm itens
  const { data: pedidosComItens } = await supabase
    .from("tiny_pedido_itens")
    .select("id_pedido")
    .in("id_pedido", pedidos.map(p => p.id));

  const idsComItens = new Set(pedidosComItens?.map(p => p.id_pedido) || []);
  const pedidosSemItens = pedidos.filter(p => !idsComItens.has(p.id));

  console.log(`✅ Já processados: ${idsComItens.size} pedidos`);
  console.log(`⏳ Faltam: ${pedidosSemItens.length} pedidos\n`);
  
  stats.totalPedidos = pedidos.length;
  stats.jaProcessados = idsComItens.size;

  if (pedidosSemItens.length === 0) {
    console.log("✨ Todos os pedidos já têm itens sincronizados!");
    return stats;
  }

  // Processar cada pedido sem itens
  for (let i = 0; i < pedidosSemItens.length; i++) {
    const pedido = pedidosSemItens[i];
    
    try {
      const progressoPercent = ((i + 1) / pedidosSemItens.length * 100).toFixed(1);
      const dataFormatada = new Date(pedido.data_criacao).toLocaleDateString('pt-BR');
      
      console.log(
        `[${i + 1}/${pedidosSemItens.length}] (${progressoPercent}%) ` +
        `Pedido #${pedido.numero_pedido || pedido.tiny_id} (${dataFormatada})...`
      );

      // Buscar detalhes do pedido na API
      const pedidoDetalhado = await obterPedidoDetalhado(
        accessToken,
        pedido.tiny_id
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

        // Inserir itens
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
        console.log(`   ⏸️  Rate limit atingido, aguardando 10 segundos...`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }
  }

  return stats;
}

async function main() {
  // Ler número de dias do argumento (padrão: 2)
  const dias = parseInt(process.argv[2] || "2", 10);
  
  if (isNaN(dias) || dias <= 0) {
    console.error("❌ Número de dias inválido. Use: npx tsx scripts/forceSyncItensRecent.ts [dias]");
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("  SINCRONIZAÇÃO DE ITENS DOS PEDIDOS RECENTES");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Período: Últimos ${dias} dias`);
  console.log("═══════════════════════════════════════════════════════\n");

  const startTime = Date.now();

  try {
    const stats = await syncItensRecentes(dias);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const minutos = (parseFloat(duration) / 60).toFixed(1);

    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  RESULTADO DA SINCRONIZAÇÃO");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`📦 Total de pedidos no período: ${stats.totalPedidos}`);
    console.log(`✅ Já tinham itens: ${stats.jaProcessados}`);
    console.log(`🔄 Processados agora: ${stats.pedidosComItens + stats.pedidosSemItens}`);
    console.log(`📊 Com itens sincronizados: ${stats.pedidosComItens}`);
    console.log(`🔢 Total de itens salvos: ${stats.totalItens}`);
    console.log(`⚠️  Pedidos sem itens: ${stats.pedidosSemItens}`);
    if (stats.erros > 0) {
      console.log(`❌ Erros: ${stats.erros}`);
    }
    console.log(`⏱️  Tempo total: ${duration}s (${minutos} min)`);
    console.log("═══════════════════════════════════════════════════════\n");

    // Mostrar resumo final
    if (stats.pedidosComItens > 0) {
      console.log(`✨ Sucesso! ${stats.totalItens} itens capturados de ${stats.pedidosComItens} pedidos\n`);
    }

    process.exit(stats.erros > 0 ? 1 : 0);
  } catch (error: any) {
    console.error("\n❌ ERRO FATAL:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
