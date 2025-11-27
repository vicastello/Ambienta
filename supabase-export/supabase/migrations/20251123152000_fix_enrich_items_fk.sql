-- Safety patch: avoid FK violations when Tiny returns items with unknown products.
-- If id_produto_tiny is not present in tiny_produtos, we now set it to NULL before insert.
-- This keeps item rows while respecting the FK constraint.

CREATE OR REPLACE FUNCTION enrich_tiny_orders_details(p_limit integer DEFAULT 12)
RETURNS TABLE (
  processed integer,
  updated integer,
  failed integer,
  last_error text,
  executed_at timestamptz
) AS $$
DECLARE
  v_token text;
  v_target RECORD;
  v_response http_response;
  v_detail jsonb;
  v_items jsonb;
  v_item jsonb;
  v_prod jsonb;
  v_valor_frete_text text;
  v_valor_frete numeric;
  v_canal text;
  v_cliente text;
  v_quantidade numeric;
  v_valor_unit numeric;
  v_valor_total numeric;
  v_last_error text;
  v_item_id_produto integer;
  v_item_codigo text;
  v_item_info text;
  v_prod_exists boolean;
BEGIN
  processed := 0;
  updated := 0;
  failed := 0;
  last_error := NULL;

  SELECT access_token INTO v_token FROM tiny_tokens WHERE id = 1;
  IF v_token IS NULL THEN
    last_error := 'No token found';
    RETURN QUERY SELECT 0, 0, 0, last_error, now();
    RETURN;
  END IF;

  FOR v_target IN
    SELECT id, tiny_id
    FROM tiny_orders
    WHERE (is_enriched = FALSE)
       OR valor_frete IS NULL
       OR canal IS NULL
       OR canal = ''
       OR canal = 'Outros'
    ORDER BY data_criacao DESC NULLS LAST, updated_at DESC
    LIMIT COALESCE(p_limit, 12)
  LOOP
    processed := processed + 1;

    BEGIN
      v_response := http((
        'GET',
        'https://api.tiny.com.br/public-api/v3/pedidos/' || v_target.tiny_id,
        ARRAY[
          http_header('Authorization', 'Bearer ' || v_token),
          http_header('Accept', 'application/json')
        ],
        NULL,
        NULL
      )::http_request);
    EXCEPTION WHEN OTHERS THEN
      failed := failed + 1;
      v_last_error := 'HTTP error: ' || SQLERRM;
      CONTINUE;
    END;

    IF v_response.status != 200 THEN
      failed := failed + 1;
      v_last_error := 'Tiny detail returned ' || v_response.status::text;
      CONTINUE;
    END IF;

    BEGIN
      v_detail := v_response.content::jsonb;
      -- Alguns responses vêm envelopados (ex: {"pedido": {...}}); normaliza para o nó do pedido
      v_detail := COALESCE(
        v_detail->'pedido',
        v_detail
      );
    EXCEPTION WHEN OTHERS THEN
      failed := failed + 1;
      v_last_error := 'JSON parse error: ' || SQLERRM;
      CONTINUE;
    END;

    v_valor_frete := NULL;
    v_valor_frete_text := NULLIF(v_detail->>'valorFrete', '');
    IF v_valor_frete_text IS NOT NULL THEN
      BEGIN
        IF POSITION(',' IN v_valor_frete_text) > 0 THEN
          v_valor_frete := REPLACE(REPLACE(v_valor_frete_text, '.', ''), ',', '.')::numeric;
        ELSE
          v_valor_frete := v_valor_frete_text::numeric;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_valor_frete := NULL;
      END;
    END IF;

    v_canal := NULLIF(COALESCE(
      v_detail#>>'{ecommerce,canalVenda}',
      v_detail#>>'{ecommerce,nome}',
      v_detail#>>'{ecommerce,canal}'
    ), '');

    v_cliente := NULLIF(v_detail#>>'{cliente,nome}', '');

    UPDATE tiny_orders
    SET valor_frete = COALESCE(v_valor_frete, valor_frete),
        canal = CASE
          WHEN canal IS NULL OR canal = '' OR canal = 'Outros'
            THEN COALESCE(v_canal, canal)
          ELSE canal
        END,
        cliente_nome = COALESCE(v_cliente, cliente_nome),
        raw = v_detail,
        is_enriched = TRUE,
        updated_at = now()
    WHERE id = v_target.id;

    -- Replace items for the order
    DELETE FROM tiny_pedido_itens WHERE id_pedido = v_target.id;

    v_items := v_detail -> 'itens';
    IF v_items IS NOT NULL AND jsonb_typeof(v_items) = 'array' THEN
      FOR v_item IN SELECT jsonb_array_elements(v_items)
      LOOP
        v_prod := v_item -> 'produto';
        v_quantidade := 0;
        v_valor_unit := 0;
        v_valor_total := NULL;
        v_item_id_produto := NULL;
        v_item_codigo := NULL;
        v_item_info := NULL;
        v_prod_exists := FALSE;

        BEGIN
          v_quantidade := COALESCE((v_item->>'quantidade')::numeric, 0);
        EXCEPTION WHEN OTHERS THEN
          v_quantidade := 0;
        END;

        BEGIN
          v_valor_unit := COALESCE((v_item->>'valorUnitario')::numeric, 0);
        EXCEPTION WHEN OTHERS THEN
          v_valor_unit := 0;
        END;

        BEGIN
          v_valor_total := COALESCE((v_item->>'valorTotal')::numeric, v_quantidade * v_valor_unit);
        EXCEPTION WHEN OTHERS THEN
          v_valor_total := v_quantidade * v_valor_unit;
        END;

        v_item_id_produto := NULLIF(COALESCE(v_prod->>'id', v_prod->>'idProduto'), '')::integer;
        v_item_codigo := NULLIF(COALESCE(v_prod->>'codigo', v_prod->>'sku'), '');
        v_item_info := NULLIF(COALESCE(v_item->>'infoAdicional', v_item->>'informacoesAdicionais'), '');

        -- Se o produto não existe na tiny_produtos, evitar violação de FK
        IF v_item_id_produto IS NOT NULL THEN
          SELECT EXISTS(
            SELECT 1 FROM tiny_produtos WHERE id_produto_tiny = v_item_id_produto
          ) INTO v_prod_exists;
          IF NOT v_prod_exists THEN
            v_item_id_produto := NULL; -- mantém item sem FK
          END IF;
        END IF;

        DELETE FROM tiny_pedido_itens
        WHERE id_pedido = v_target.id
          AND COALESCE(id_produto_tiny, -1) = COALESCE(v_item_id_produto, -1)
          AND COALESCE(codigo_produto, '') = COALESCE(v_item_codigo, '');

        INSERT INTO tiny_pedido_itens (
          id_pedido,
          id_produto_tiny,
          codigo_produto,
          nome_produto,
          quantidade,
          valor_unitario,
          valor_total,
          info_adicional
        ) VALUES (
          v_target.id,
          v_item_id_produto,
          v_item_codigo,
          COALESCE(v_prod->>'descricao', v_prod->>'nome', 'Sem descrição'),
          v_quantidade,
          v_valor_unit,
          COALESCE(v_valor_total, v_quantidade * v_valor_unit),
          v_item_info
        );
      END LOOP;
    END IF;

    updated := updated + 1;

    -- Gentle pause to avoid rate limit spikes (approx 100 req/min)
    PERFORM pg_sleep(0.65);
  END LOOP;

  executed_at := now();
  last_error := v_last_error;
  RETURN QUERY SELECT processed, updated, failed, last_error, executed_at;
END;
$$ LANGUAGE plpgsql;

