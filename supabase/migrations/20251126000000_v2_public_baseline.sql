-- Baseline v2 (only public) derived from remote schema + hardening
-- Objetivo: reconstruir o schema público atual (tabelas, índices, FKs, funções essenciais, triggers, RLS/policies, grants)
-- Sem mexer em auth/storage/realtime ou schemas internos.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Extensões necessárias para funções/triggers (idempotentes)
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-----------------------------
-- Sequences (public)
-----------------------------
CREATE SEQUENCE IF NOT EXISTS public.tiny_orders_id_seq
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.tiny_pedido_itens_id_seq
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.tiny_produtos_id_seq
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

-----------------------------
-- Tables (public)
-----------------------------
CREATE TABLE IF NOT EXISTS public.sync_settings (
    id integer DEFAULT 1 NOT NULL,
    auto_sync_enabled boolean DEFAULT false NOT NULL,
    auto_sync_window_days integer DEFAULT 2 NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sync_jobs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    status text NOT NULL,
    error text,
    params jsonb,
    total_requests integer DEFAULT 0,
    total_orders integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.sync_logs (
    id bigserial PRIMARY KEY,
    job_id uuid REFERENCES public.sync_jobs(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    level text NOT NULL,
    message text NOT NULL,
    meta jsonb
);

CREATE TABLE IF NOT EXISTS public.tiny_orders (
    id bigint NOT NULL,
    tiny_id bigint NOT NULL,
    numero_pedido integer,
    situacao integer,
    data_criacao date,
    valor numeric(14,2),
    canal text,
    cliente_nome text,
    raw jsonb,
    inserted_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    last_sync_check timestamptz DEFAULT now(),
    data_hash varchar(32),
    is_enriched boolean DEFAULT false,
    valor_frete numeric(10,2),
    cidade text,
    uf text,
    cidade_lat double precision,
    cidade_lon double precision
);

CREATE TABLE IF NOT EXISTS public.tiny_pedido_itens (
    id bigint NOT NULL,
    id_pedido integer NOT NULL,
    id_produto_tiny integer,
    codigo_produto text,
    nome_produto text NOT NULL,
    quantidade numeric(15,3) NOT NULL,
    valor_unitario numeric(15,2) NOT NULL,
    valor_total numeric(15,2) NOT NULL,
    info_adicional text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tiny_produtos (
    id bigint NOT NULL,
    id_produto_tiny integer NOT NULL,
    codigo text,
    nome text NOT NULL,
    unidade text,
    preco numeric(15,2),
    preco_promocional numeric(15,2),
    saldo numeric(15,3),
    reservado numeric(15,3),
    disponivel numeric(15,3),
    situacao text,
    tipo text,
    gtin text,
    descricao text,
    ncm text,
    origem text,
    peso_liquido numeric(15,3),
    peso_bruto numeric(15,3),
    data_criacao_tiny timestamptz,
    data_atualizacao_tiny timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    imagem_url text,
    fornecedor_codigo text,
    embalagem_qtd numeric
);

CREATE TABLE IF NOT EXISTS public.tiny_tokens (
    id integer DEFAULT 1 NOT NULL,
    access_token text,
    refresh_token text,
    expires_at bigint,
    scope text,
    token_type text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-----------------------------
-- Defaults linking sequences
-----------------------------
ALTER TABLE public.tiny_orders
    ALTER COLUMN id SET DEFAULT nextval('public.tiny_orders_id_seq'::regclass);

ALTER TABLE public.tiny_pedido_itens
    ALTER COLUMN id SET DEFAULT nextval('public.tiny_pedido_itens_id_seq'::regclass);

ALTER TABLE public.tiny_produtos
    ALTER COLUMN id SET DEFAULT nextval('public.tiny_produtos_id_seq'::regclass);

-----------------------------
-- Constraints (PK/Unique/FK)
-----------------------------
ALTER TABLE ONLY public.sync_settings
    ADD CONSTRAINT sync_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tiny_orders
    ADD CONSTRAINT tiny_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tiny_orders
    ADD CONSTRAINT tiny_orders_tiny_id_key UNIQUE (tiny_id);

ALTER TABLE ONLY public.tiny_pedido_itens
    ADD CONSTRAINT tiny_pedido_itens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tiny_produtos
    ADD CONSTRAINT tiny_produtos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tiny_produtos
    ADD CONSTRAINT tiny_produtos_id_produto_tiny_key UNIQUE (id_produto_tiny);

ALTER TABLE ONLY public.tiny_tokens
    ADD CONSTRAINT tiny_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tiny_pedido_itens
    ADD CONSTRAINT tiny_pedido_itens_id_pedido_fkey FOREIGN KEY (id_pedido) REFERENCES public.tiny_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tiny_pedido_itens
    ADD CONSTRAINT fk_produto FOREIGN KEY (id_produto_tiny) REFERENCES public.tiny_produtos(id_produto_tiny) ON DELETE SET NULL;

-----------------------------
-- Indexes
-----------------------------
CREATE INDEX IF NOT EXISTS idx_tiny_orders_canal ON public.tiny_orders USING btree (canal);
CREATE INDEX IF NOT EXISTS idx_tiny_orders_cidade ON public.tiny_orders USING btree (cidade);
CREATE INDEX IF NOT EXISTS idx_tiny_orders_data_criacao ON public.tiny_orders USING btree (data_criacao);
CREATE INDEX IF NOT EXISTS idx_tiny_orders_data_criacao_desc ON public.tiny_orders USING btree (data_criacao DESC);
CREATE INDEX IF NOT EXISTS idx_tiny_orders_data_hash ON public.tiny_orders USING btree (data_hash);
CREATE INDEX IF NOT EXISTS idx_tiny_orders_data_situacao ON public.tiny_orders USING btree (data_criacao, situacao);
CREATE INDEX IF NOT EXISTS idx_tiny_orders_is_enriched ON public.tiny_orders USING btree (is_enriched) WHERE (is_enriched = false);
CREATE INDEX IF NOT EXISTS idx_tiny_orders_last_sync_check ON public.tiny_orders USING btree (last_sync_check DESC);
CREATE INDEX IF NOT EXISTS idx_tiny_orders_needs_enrichment ON public.tiny_orders USING btree (data_criacao) WHERE (valor_frete IS NULL);
CREATE INDEX IF NOT EXISTS idx_tiny_orders_situacao ON public.tiny_orders USING btree (situacao);
CREATE INDEX IF NOT EXISTS idx_tiny_orders_uf ON public.tiny_orders USING btree (uf);
CREATE INDEX IF NOT EXISTS idx_tiny_orders_valor_frete ON public.tiny_orders USING btree (valor_frete) WHERE (valor_frete IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_tiny_pedido_itens_pedido ON public.tiny_pedido_itens USING btree (id_pedido);
CREATE INDEX IF NOT EXISTS idx_tiny_pedido_itens_produto ON public.tiny_pedido_itens USING btree (id_produto_tiny);
CREATE INDEX IF NOT EXISTS idx_tiny_pedido_itens_codigo ON public.tiny_pedido_itens USING btree (codigo_produto);

CREATE INDEX IF NOT EXISTS idx_tiny_produtos_codigo ON public.tiny_produtos USING btree (codigo);
CREATE INDEX IF NOT EXISTS idx_tiny_produtos_nome ON public.tiny_produtos USING gin (to_tsvector('portuguese'::regconfig, nome));
CREATE INDEX IF NOT EXISTS idx_tiny_produtos_situacao ON public.tiny_produtos USING btree (situacao);
CREATE INDEX IF NOT EXISTS idx_tiny_produtos_updated_at ON public.tiny_produtos USING btree (updated_at DESC);

-----------------------------
-- Functions (essenciais)
-----------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_tiny_produtos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger helper: chama /api/tiny/sync/itens via pg_net ao inserir pedidos
CREATE OR REPLACE FUNCTION public.tiny_orders_auto_sync_itens()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tiny_id IS NULL THEN
    RETURN NEW;
  END IF;

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

-- Métricas de pedidos
CREATE OR REPLACE FUNCTION public.orders_metrics(
    p_data_inicial date default null,
    p_data_final date default null,
    p_canais text[] default null,
    p_situacoes int[] default null,
    p_search text default null
)
RETURNS table (
    total_orders bigint,
    total_bruto numeric,
    total_frete numeric,
    total_liquido numeric,
    situacao_counts jsonb
) AS $$
with base as (
    select
        tiny_id,
        coalesce(valor, 0)::numeric as valor_bruto,
        coalesce(valor_frete, 0)::numeric as valor_frete,
        coalesce(situacao, -1) as situacao,
        cliente_nome,
        canal,
        numero_pedido,
        data_criacao
    from public.tiny_orders
    where (p_data_inicial is null or data_criacao >= p_data_inicial)
        and (p_data_final is null or data_criacao <= p_data_final)
        and (p_canais is null or canal = any(p_canais))
        and (p_situacoes is null or situacao = any(p_situacoes))
        and (
            p_search is null
            or cliente_nome ilike '%' || p_search || '%'
            or canal ilike '%' || p_search || '%'
            or cast(numero_pedido as text) ilike '%' || p_search || '%'
            or cast(tiny_id as text) ilike '%' || p_search || '%'
        )
),
totals as (
    select
        count(*) as total_orders,
        coalesce(sum(valor_bruto), 0) as total_bruto,
        coalesce(sum(valor_frete), 0) as total_frete,
        coalesce(sum(valor_bruto - valor_frete), 0) as total_liquido
    from base
),
status_counts as (
    select coalesce(jsonb_object_agg(situacao::text, cnt), '{}'::jsonb) as situacao_counts
    from (
        select situacao, count(*) as cnt
        from base
        group by situacao
    ) as grouped
)
select
    coalesce(totals.total_orders, 0) as total_orders,
    coalesce(totals.total_bruto, 0) as total_bruto,
    coalesce(totals.total_frete, 0) as total_frete,
    coalesce(totals.total_liquido, 0) as total_liquido,
    coalesce(status_counts.situacao_counts, '{}'::jsonb) as situacao_counts
from totals cross join status_counts;
$$ LANGUAGE sql STABLE;

-----------------------------
-- Triggers
-----------------------------
DROP TRIGGER IF EXISTS trg_sync_settings_updated_at ON public.sync_settings;
CREATE TRIGGER trg_sync_settings_updated_at
BEFORE UPDATE ON public.sync_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tiny_orders_updated_at ON public.tiny_orders;
CREATE TRIGGER trg_tiny_orders_updated_at
BEFORE UPDATE ON public.tiny_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tiny_orders_auto_sync_itens ON public.tiny_orders;
CREATE TRIGGER trg_tiny_orders_auto_sync_itens
AFTER INSERT ON public.tiny_orders
FOR EACH ROW EXECUTE FUNCTION public.tiny_orders_auto_sync_itens();

DROP TRIGGER IF EXISTS trigger_update_tiny_produtos_updated_at ON public.tiny_produtos;
CREATE TRIGGER trigger_update_tiny_produtos_updated_at
BEFORE UPDATE ON public.tiny_produtos
FOR EACH ROW EXECUTE FUNCTION public.update_tiny_produtos_updated_at();

-----------------------------
-- Row Level Security + Policies
-----------------------------
ALTER TABLE public.tiny_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiny_pedido_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiny_produtos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiny_tokens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_settings     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r text;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'tiny_orders',
    'tiny_pedido_itens',
    'tiny_produtos',
    'tiny_tokens',
    'sync_jobs',
    'sync_logs',
    'sync_settings'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_full_access ON public.%I;', r);
    EXECUTE format(
      'CREATE POLICY service_role_full_access ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      r
    );
  END LOOP;
END $$;

-----------------------------
-- Grants/Revokes (public only)
-----------------------------
-- Revoga anon/authenticated em tabelas
REVOKE ALL ON TABLE public.tiny_orders       FROM anon, authenticated;
REVOKE ALL ON TABLE public.tiny_pedido_itens FROM anon, authenticated;
REVOKE ALL ON TABLE public.tiny_produtos     FROM anon, authenticated;
REVOKE ALL ON TABLE public.tiny_tokens       FROM anon, authenticated;
REVOKE ALL ON TABLE public.sync_jobs         FROM anon, authenticated;
REVOKE ALL ON TABLE public.sync_logs         FROM anon, authenticated;
REVOKE ALL ON TABLE public.sync_settings     FROM anon, authenticated;

-- Revoga anon/authenticated em sequências
REVOKE ALL ON SEQUENCE public.tiny_orders_id_seq       FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.tiny_pedido_itens_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.tiny_produtos_id_seq     FROM anon, authenticated;

-- Revoga exec de funções críticas
REVOKE ALL ON FUNCTION public.orders_metrics(date, date, text[], int[], text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.tiny_orders_auto_sync_itens() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.update_tiny_produtos_updated_at() FROM anon, authenticated;

-- Concede acesso ao service_role
GRANT ALL ON TABLE public.tiny_orders, public.tiny_pedido_itens, public.tiny_produtos, public.tiny_tokens, public.sync_jobs, public.sync_logs, public.sync_settings TO service_role;
GRANT ALL ON SEQUENCE public.tiny_orders_id_seq, public.tiny_pedido_itens_id_seq, public.tiny_produtos_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION public.orders_metrics(date, date, text[], int[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tiny_orders_auto_sync_itens() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_tiny_produtos_updated_at() TO service_role;

-----------------------------
-- Comments (preservam contexto)
-----------------------------
COMMENT ON COLUMN public.tiny_orders.last_sync_check IS 'Timestamp of last sync check - used for differential polling';
COMMENT ON COLUMN public.tiny_orders.data_hash IS 'MD5 hash of order data - used to detect changes';
COMMENT ON COLUMN public.tiny_orders.is_enriched IS 'Whether order has been enriched with detailed data (frete, etc)';
