-- Trigger para sincronizar itens automaticamente quando um pedido é inserido
-- Assim que um registro é criado em tiny_orders, o Postgres chama a rota
-- /api/tiny/sync/itens passando o tiny_id do pedido para salvar os itens

-- Usamos a extensão pg_net (schema "net") para chamadas HTTP
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Função de trigger
CREATE OR REPLACE FUNCTION public.tiny_orders_auto_sync_itens()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Evita chamadas quando não há tiny_id
  IF NEW.tiny_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Dispara chamada HTTP para API do app (Vercel)
  -- Importante: usar o domínio estável de produção (alias), NUNCA o subdomínio efêmero do deploy
  PERFORM net.http_post(
    url := 'https://gestor-tiny.vercel.app/api/tiny/sync/itens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-Trigger/1.0'
    ),
    body := jsonb_build_object(
      'tinyIds', jsonb_build_array(to_jsonb(NEW.tiny_id))
    )
  );

  RETURN NEW;
END;
$$;

-- Garante recriação idempotente do trigger
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tiny_orders_auto_sync_itens'
  ) THEN
    EXECUTE 'DROP TRIGGER trg_tiny_orders_auto_sync_itens ON public.tiny_orders';
  END IF;
END $$;

CREATE TRIGGER trg_tiny_orders_auto_sync_itens
AFTER INSERT ON public.tiny_orders
FOR EACH ROW
EXECUTE FUNCTION public.tiny_orders_auto_sync_itens();
