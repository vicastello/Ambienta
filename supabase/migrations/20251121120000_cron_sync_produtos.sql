-- Cron job no Supabase para sincronizar produtos a cada 2 minutos
-- Usando pg_cron (sem limitações do Vercel)

-- Remove agendamentos antigos se existirem
DO $$ BEGIN
  PERFORM cron.unschedule('sync-produtos-supabase');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS http;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Função para sincronizar produtos via HTTP direto do PostgreSQL
CREATE OR REPLACE FUNCTION sync_produtos_from_tiny()
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
  -- 1. Buscar token
  SELECT access_token INTO v_token 
  FROM tiny_tokens 
  ORDER BY created_at DESC 
  LIMIT 1;
  
  IF v_token IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0, 'No token found'::text, now();
    RETURN;
  END IF;

  -- 2. Chamar API do Tiny (apenas produtos ativos, limite de 100)
  BEGIN
    v_response := http((
      'GET',
      'https://api.tiny.com.br/public-api/v3/produtos?situacao=A&limit=100',
      ARRAY[
        http_header('Authorization', 'Bearer ' || v_token),
        http_header('Accept', 'application/json')
      ]
    )::http_request);
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 0, 0, 0, 'HTTP error: ' || SQLERRM, now();
    RETURN;
  END;

  IF v_response.status != 200 THEN
    RETURN QUERY SELECT 0, 0, 0, 'Tiny API returned ' || v_response.status::text, now();
    RETURN;
  END IF;

  -- 3. Parse JSON
  BEGIN
    v_produtos := v_response.content::jsonb -> 'itens';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 0, 0, 0, 'JSON parsing error: ' || SQLERRM, now();
    RETURN;
  END;

  -- 4. Processar cada produto
  FOR v_produto IN SELECT jsonb_array_elements(v_produtos)
  LOOP
    v_processed := v_processed + 1;
    v_produto_id := (v_produto->>'id')::bigint;
    
    -- Verificar se existe
    SELECT EXISTS(
      SELECT 1 FROM tiny_produtos WHERE id_produto_tiny = v_produto_id
    ) INTO v_exists;
    
    -- Upsert produto COM ESTOQUE
    INSERT INTO tiny_produtos (
      id_produto_tiny,
      codigo,
      nome,
      unidade,
      preco,
      preco_promocional,
      saldo,
      situacao,
      tipo,
      gtin,
      data_criacao_tiny,
      data_atualizacao_tiny,
      updated_at
    ) VALUES (
      v_produto_id,
      v_produto->>'sku',
      v_produto->>'descricao',
      v_produto->>'unidade',
      (v_produto->'precos'->>'preco')::numeric,
      (v_produto->'precos'->>'precoPromocional')::numeric,
      (v_produto->'estoques'->>'saldo')::numeric,
      v_produto->>'situacao',
      v_produto->>'tipo',
      v_produto->>'gtin',
      (v_produto->>'dataCriacao')::timestamptz,
      (v_produto->>'dataAlteracao')::timestamptz,
      now()
    )
    ON CONFLICT (id_produto_tiny) DO UPDATE SET
      codigo = EXCLUDED.codigo,
      nome = EXCLUDED.nome,
      unidade = EXCLUDED.unidade,
      preco = EXCLUDED.preco,
      preco_promocional = EXCLUDED.preco_promocional,
      saldo = EXCLUDED.saldo,
      situacao = EXCLUDED.situacao,
      tipo = EXCLUDED.tipo,
      gtin = EXCLUDED.gtin,
      data_atualizacao_tiny = EXCLUDED.data_atualizacao_tiny,
      updated_at = now();
    
    IF v_exists THEN
      v_updated := v_updated + 1;
    ELSE
      v_new := v_new + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_updated, v_new, NULL::text, now();
END;
$$ LANGUAGE plpgsql;

-- Agendar para rodar a cada 2 minutos
SELECT cron.schedule(
  'sync-produtos-supabase',
  '*/2 * * * *',
  'SELECT sync_produtos_from_tiny();'
);
