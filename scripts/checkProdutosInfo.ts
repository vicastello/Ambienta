/**
 * Verificar informações atuais de estoque e imagem nos produtos
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Variáveis de ambiente do Supabase não configuradas");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("🔍 Verificando informações de produtos...\n");

  // Total de produtos
  const { data: allData, error: allError } = await supabase
    .from("tiny_produtos")
    .select("id", { count: "exact" });

  console.log(`📦 Total de produtos: ${allData?.length || 0}`);
  if (allError) console.error("Erro:", allError);

  // Produtos sem estoque (saldo = null ou 0)
  const { data: noStockData, error: noStockError } = await supabase
    .from("tiny_produtos")
    .select("id")
    .or("saldo.is.null,saldo.eq.0");

  console.log(`📊 Produtos sem estoque informado: ${noStockData?.length || 0}`);
  if (noStockError) console.error("Erro:", noStockError);

  // Produtos sem imagem
  const { data: noImageData, error: noImageError } = await supabase
    .from("tiny_produtos")
    .select("id")
    .is("imagem_url", null);

  console.log(`🖼️  Produtos sem imagem: ${noImageData?.length || 0}`);
  if (noImageError) console.error("Erro:", noImageError);

  // Amostra de 5 produtos
  const { data: amostra } = await supabase
    .from("tiny_produtos")
    .select("id_produto_tiny, codigo, nome, saldo, reservado, disponivel, imagem_url")
    .limit(5);

  console.log("\n📋 Amostra de produtos:");
  amostra?.forEach((p) => {
    console.log(`   ${p.id_produto_tiny} | ${p.codigo} | ${p.nome?.slice(0, 30)} | Estoque: ${p.saldo ?? "NULL"} | Imagem: ${p.imagem_url ? "✅" : "❌"}`);
  });

  console.log("\n✅ Verificação concluída");
}

main();

export {};
