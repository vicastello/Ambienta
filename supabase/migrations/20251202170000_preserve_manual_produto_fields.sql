-- Recria sync_produtos_from_tiny preservando campos locais (fornecedor_codigo, embalagem_qtd, observacao_compras)
-- para que as edições feitas na tela de Compras não sejam sobrescritas pelo cron

CREATE OR REPLACE FUNCTION public.sync_produtos_from_tiny()
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
  v_offset integer := 0;
  v_limit integer := 100;
  v_page_count integer := 0;
  v_max_pages integer := 50;
BEGIN
  SELECT access_token INTO v_token
  FROM tiny_tokens
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0, 'No token found'::text, now();
    RETURN;
  END IF;

  WHILE v_page_count < v_max_pages LOOP
    v_page_count := v_page_count + 1;

    BEGIN
      v_response := http((
        'GET',
        format('https://api.tiny.com.br/public-api/v3/produtos?situacao=A&limit=%s&offset=%s', v_limit, v_offset),
        ARRAY[
          http_header('Authorization', 'Bearer ' || v_token),
          http_header('Accept', 'application/json')
        ]
      )::http_request);
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_processed, v_updated, v_new, 'HTTP error: ' || SQLERRM, now();
      RETURN;
    END;

    IF v_response.status != 200 THEN
      RETURN QUERY SELECT v_processed, v_updated, v_new, 'Tiny API returned ' || v_response.status::text, now();
      RETURN;
    END IF;

    BEGIN
      v_produtos := v_response.content::jsonb -> 'itens';
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_processed, v_updated, v_new, 'JSON parsing error: ' || SQLERRM, now();
      RETURN;
    END;

    IF v_produtos IS NULL OR jsonb_array_length(v_produtos) = 0 THEN
      EXIT;
    END IF;

    FOR v_produto IN SELECT jsonb_array_elements(v_produtos)
    LOOP
      v_processed := v_processed + 1;
      v_produto_id := (v_produto->>'id')::bigint;

      SELECT EXISTS(
        SELECT 1 FROM tiny_produtos WHERE id_produto_tiny = v_produto_id
      ) INTO v_exists;

      INSERT INTO tiny_produtos (
        id_produto_tiny,
        codigo,
        nome,
        unidade,
        preco,
        preco_promocional,
        saldo,
        reservado,
        disponivel,
        situacao,
        tipo,
        gtin,
        descricao,
        data_criacao_tiny,
        data_atualizacao_tiny,
        updated_at
      ) VALUES (
        v_produto_id,
        COALESCE(
          NULLIF(trim(v_produto->>'sku'), ''),
          NULLIF(trim(v_produto->>'codigo'), ''),
          NULLIF(trim(v_produto->>'descricao'), ''),
          'ID-' || v_produto_id
        ),
        COALESCE(NULLIF(trim(v_produto->>'descricao'), ''), 'Produto ' || v_produto_id),
        NULLIF(trim(v_produto->>'unidade'), ''),
        (v_produto->'precos'->>'preco')::numeric,
        (v_produto->'precos'->>'precoPromocional')::numeric,
        (v_produto->'estoques'->>'saldo')::numeric,
        COALESCE((v_produto->'estoques'->>'reservado')::numeric, 0),
        COALESCE(
          (v_produto->'estoques'->>'disponivel')::numeric,
          (v_produto->'estoques'->>'saldo')::numeric
        ),
        NULLIF(trim(v_produto->>'situacao'), ''),
        NULLIF(trim(v_produto->>'tipo'), ''),
        NULLIF(trim(v_produto->>'gtin'), ''),
        NULLIF(trim(v_produto->>'descricao'), ''),
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
        reservado = EXCLUDED.reservado,
        disponivel = EXCLUDED.disponivel,
        situacao = EXCLUDED.situacao,
        tipo = EXCLUDED.tipo,
        gtin = EXCLUDED.gtin,
        descricao = EXCLUDED.descricao,
        data_criacao_tiny = COALESCE(EXCLUDED.data_criacao_tiny, tiny_produtos.data_criacao_tiny),
        data_atualizacao_tiny = EXCLUDED.data_atualizacao_tiny,
        updated_at = now(),
        fornecedor_codigo = COALESCE(tiny_produtos.fornecedor_codigo, EXCLUDED.fornecedor_codigo),
        embalagem_qtd = COALESCE(tiny_produtos.embalagem_qtd, EXCLUDED.embalagem_qtd),
        observacao_compras = COALESCE(tiny_produtos.observacao_compras, EXCLUDED.observacao_compras);

      IF v_exists THEN
        v_updated := v_updated + 1;
      ELSE
        v_new := v_new + 1;
      END IF;
    END LOOP;

    v_offset := v_offset + v_limit;
    PERFORM pg_sleep(0.6);
  END LOOP;

  RETURN QUERY SELECT v_processed, v_updated, v_new, NULL::text, now();
END;
$$ LANGUAGE plpgsql;
