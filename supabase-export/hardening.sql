-- Hardening mínimo para dados de negócio no Supabase
-- Objetivo: tirar acesso de anon/authenticated das tabelas/seq/funções críticas
-- e restringir uso ao service_role + habilitar RLS para evitar leitura/escrita pública.
-- Revise antes de aplicar em produção.

BEGIN;

-------------------------
-- 1) Revogar privilégios
-------------------------
-- Tabelas de negócio
REVOKE ALL ON TABLE public.tiny_orders        FROM anon, authenticated;
REVOKE ALL ON TABLE public.tiny_pedido_itens  FROM anon, authenticated;
REVOKE ALL ON TABLE public.tiny_produtos      FROM anon, authenticated;
REVOKE ALL ON TABLE public.tiny_tokens        FROM anon, authenticated;
REVOKE ALL ON TABLE public.sync_jobs          FROM anon, authenticated;
REVOKE ALL ON TABLE public.sync_logs          FROM anon, authenticated;
REVOKE ALL ON TABLE public.sync_settings      FROM anon, authenticated;

-- Sequências ligadas
REVOKE ALL ON SEQUENCE public.tiny_orders_id_seq       FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.tiny_pedido_itens_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.tiny_produtos_id_seq     FROM anon, authenticated;

-- Funções sensíveis (sync/enrichment)
REVOKE ALL ON FUNCTION public.sync_tiny_orders_direct()                    FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_tiny_orders_efficient(text, text)       FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_tiny_orders_now(text, text)             FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_tiny_orders_sql_direct()                FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.enrich_tiny_orders_details(integer)          FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.tiny_orders_auto_sync_itens()                FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_produtos_from_tiny()                    FROM anon, authenticated;

-------------------------
-- 2) Habilitar RLS
-------------------------
ALTER TABLE public.tiny_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiny_pedido_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiny_produtos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiny_tokens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_settings     ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- 3) Políticas mínimas: liberar apenas service_role
-- (ajuste/adicione policies para usuários reais se preciso)
----------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'tiny_orders',
    'tiny_pedido_itens',
    'tiny_produtos',
    'tiny_tokens',
    'sync_jobs',
    'sync_logs',
    'sync_settings'
  ]) AS tbl LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_full_access ON public.%I;', r.tbl);
    EXECUTE format(
      'CREATE POLICY service_role_full_access ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      r.tbl
    );
  END LOOP;
END $$;

COMMIT;

-- Como aplicar (exemplo):
-- psql "$SUPABASE_DB_URL_IPV6" -f supabase-export/hardening.sql

-- Depois de aplicar:
-- - Teste as rotas/funcs que usam service_role (tokens/via backend).
-- - Se precisar liberar leitura para authenticated, crie policies explícitas e seguras.
