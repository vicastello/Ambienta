/**
 * Aplicar migration via API do Supabase (método alternativo)
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Variáveis de ambiente não configuradas");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const sql = fs.readFileSync("/tmp/apply_cron.sql", "utf-8");
  
  console.log("🚀 Aplicando migration via API...\n");
  
  // Dividir em comandos SQL individuais
  const statements = [
    // 1. Remover cron antigo
    `DO $$ BEGIN PERFORM cron.unschedule('sync-produtos-supabase'); EXCEPTION WHEN OTHERS THEN NULL; END $$;`,
    
    // 2. Criar extensões
    `CREATE EXTENSION IF NOT EXISTS http;`,
    `CREATE EXTENSION IF NOT EXISTS pg_cron;`,
    
    // 3. Criar função (comando grande, em uma string)
    `CREATE OR REPLACE FUNCTION sync_produtos_from_tiny()
RETURNS TABLE (
  processed_count integer,
  updated_count integer,
  new_count integer,
  last_error text,
  sync_time timestamp with time zone
) AS $$
DECLARE
  v_token text;
  v_response http_response;
  v_produtos jsonb;
  v_produto jsonb;
  v_processed integer := 0;
  v_updated integer := 0;
  v_new integer := 0;
  v_produto_id bigint;
  v_exists boolean;
BEGIN
  SELECT access_token INTO v_token FROM tiny_tokens ORDER BY created_at DESC LIMIT 1;
  IF v_token IS NULL THEN RETURN QUERY SELECT 0, 0, 0, 'No token found'::text, now(); RETURN; END IF;
  BEGIN
    v_response := http(('GET', 'https://api.tiny.com.br/public-api/v3/produtos?situacao=A&limit=100', ARRAY[http_header('Authorization', 'Bearer ' || v_token), http_header('Accept', 'application/json')])::http_request);
  EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT 0, 0, 0, 'HTTP error: ' || SQLERRM, now(); RETURN; END;
  IF v_response.status != 200 THEN RETURN QUERY SELECT 0, 0, 0, 'Tiny API returned ' || v_response.status::text, now(); RETURN; END IF;
  BEGIN v_produtos := v_response.content::jsonb -> 'itens'; EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT 0, 0, 0, 'JSON parsing error: ' || SQLERRM, now(); RETURN; END;
  FOR v_produto IN SELECT jsonb_array_elements(v_produtos) LOOP
    v_processed := v_processed + 1;
    v_produto_id := (v_produto->>'id')::bigint;
    SELECT EXISTS(SELECT 1 FROM tiny_produtos WHERE id_produto_tiny = v_produto_id) INTO v_exists;
    INSERT INTO tiny_produtos (id_produto_tiny, codigo, nome, unidade, preco, preco_promocional, saldo, situacao, tipo, gtin, data_criacao_tiny, data_atualizacao_tiny, updated_at)
    VALUES (v_produto_id, v_produto->>'sku', v_produto->>'descricao', v_produto->>'unidade', (v_produto->'precos'->>'preco')::numeric, (v_produto->'precos'->>'precoPromocional')::numeric, (v_produto->'estoques'->>'saldo')::numeric, v_produto->>'situacao', v_produto->>'tipo', v_produto->>'gtin', (v_produto->>'dataCriacao')::timestamptz, (v_produto->>'dataAlteracao')::timestamptz, now())
    ON CONFLICT (id_produto_tiny) DO UPDATE SET codigo = EXCLUDED.codigo, nome = EXCLUDED.nome, unidade = EXCLUDED.unidade, preco = EXCLUDED.preco, preco_promocional = EXCLUDED.preco_promocional, saldo = EXCLUDED.saldo, situacao = EXCLUDED.situacao, tipo = EXCLUDED.tipo, gtin = EXCLUDED.gtin, data_atualizacao_tiny = EXCLUDED.data_atualizacao_tiny, updated_at = now();
    IF v_exists THEN v_updated := v_updated + 1; ELSE v_new := v_new + 1; END IF;
  END LOOP;
  RETURN QUERY SELECT v_processed, v_updated, v_new, NULL::text, now();
END;
$$ LANGUAGE plpgsql;`,
    
    // 4. Agendar cron
    `SELECT cron.schedule('sync-produtos-supabase', '*/2 * * * *', 'SELECT sync_produtos_from_tiny();');`,
  ];

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    console.log(`📝 Executando comando ${i + 1}/${statements.length}...`);
    
    try {
      const { error } = await supabase.rpc("exec_sql", { query: stmt });
      
      if (error) {
        console.error(`❌ Erro no comando ${i + 1}:`, error.message);
        console.log("\n💡 APLIQUE MANUALMENTE:");
        console.log("1. Acesse: https://supabase.com/dashboard/project/znoiauhdrujwkfryhwiz/sql/new");
        console.log("2. Cole o SQL de: /tmp/apply_cron.sql");
        console.log("3. Clique em RUN\n");
        process.exit(1);
      }
      
      console.log(`   ✅ Comando ${i + 1} executado\n`);
    } catch (err: any) {
      console.error(`❌ Erro inesperado:`, err.message);
      console.log("\n💡 APLIQUE MANUALMENTE:");
      console.log("1. Acesse: https://supabase.com/dashboard/project/znoiauhdrujwkfryhwiz/sql/new");
      console.log("2. Cole o SQL de: /tmp/apply_cron.sql");
      console.log("3. Clique em RUN\n");
      process.exit(1);
    }
  }

  console.log("✅ Migration aplicada com sucesso!");
  console.log("\n🔍 Verifique:");
  console.log("SELECT * FROM cron.job WHERE jobname = 'sync-produtos-supabase';");
  console.log("\n🧪 Teste:");
  console.log("SELECT * FROM sync_produtos_from_tiny();");
}

main();

export {};
