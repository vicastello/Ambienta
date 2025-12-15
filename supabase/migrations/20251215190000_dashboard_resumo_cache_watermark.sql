-- Adiciona watermark (source_max_updated_at) ao cache do dashboard
-- Objetivo: invalidar automaticamente quando pedidos antigos forem alterados (ex.: 60+ dias)

set search_path = public, extensions;

-- 1) Evolução do schema do cache
alter table if exists public.dashboard_resumo_cache
  add column if not exists canais_key text not null default 'all',
  add column if not exists situacoes_key text not null default 'all',
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists source_max_updated_at timestamptz null,
  add column if not exists built_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz null;

-- Garante valores padrão em registros existentes (defensivo)
update public.dashboard_resumo_cache set canais_key = 'all' where canais_key is null;
update public.dashboard_resumo_cache set situacoes_key = 'all' where situacoes_key is null;
update public.dashboard_resumo_cache set payload = '{}'::jsonb where payload is null;

-- Ajusta unicidade: período + filtros
alter table public.dashboard_resumo_cache
  drop constraint if exists dashboard_resumo_cache_periodo_unique;

create unique index if not exists dashboard_resumo_cache_key_uidx
  on public.dashboard_resumo_cache (periodo_inicio, periodo_fim, canais_key, situacoes_key);

create index if not exists dashboard_resumo_cache_lookup_idx
  on public.dashboard_resumo_cache (periodo_inicio, periodo_fim desc, canais_key, situacoes_key);

-- 2) Índices para acelerar o MAX(updated_at) / MAX(inserted_at) por período
create index if not exists tiny_orders_data_criacao_updated_at_idx
  on public.tiny_orders (data_criacao, updated_at desc);

create index if not exists tiny_orders_data_criacao_inserted_at_idx
  on public.tiny_orders (data_criacao, inserted_at desc);

-- 3) Função para calcular o watermark da fonte (Tiny Orders)
create or replace function public.dashboard_resumo_source_max_updated_at(
  p_data_inicial date,
  p_data_final date,
  p_canais text[] default null,
  p_situacoes integer[] default null
)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(
    greatest(
      coalesce(updated_at, '-infinity'::timestamptz),
      coalesce(inserted_at, '-infinity'::timestamptz)
    )
  )
  from public.tiny_orders
  where data_criacao >= p_data_inicial
    and data_criacao <= p_data_final
    and (p_canais is null or canal = any(p_canais))
    and (p_situacoes is null or situacao = any(p_situacoes));
$$;

-- 4) Compat: função existente de refresh (cron) precisa apontar para a nova constraint
-- Mantém o comportamento original, mas limita o refresh ao cache global (canais/situações = 'all')
create or replace function public.refresh_dashboard_resumo_cache(interval_days integer default 365)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_order_facts jsonb;
  v_produto_facts jsonb;
  v_last_updated timestamptz;
  v_total_pedidos bigint;
  v_total_valor numeric;
  v_total_liquido numeric;
  v_total_frete numeric;
  v_total_produtos numeric;
begin
  v_end := current_date;
  v_start := v_end - (interval_days - 1);

  with base_orders as (
    select
      id,
      coalesce(data_criacao::date, v_end) as data,
      coalesce(nullif(trim(canal), ''), 'Outros') as canal,
      coalesce(situacao, -1) as situacao,
      nullif(cidade, '') as cidade,
      nullif(uf, '') as uf,
      coalesce(valor, 0)::numeric as valor_bruto,
      coalesce(valor_frete, 0)::numeric as valor_frete,
      greatest(coalesce(inserted_at, '-infinity'::timestamptz), coalesce(updated_at, '-infinity'::timestamptz)) as last_ts
    from public.tiny_orders
    where data_criacao >= v_start and data_criacao <= v_end
  ), order_facts as (
    select
      data,
      canal,
      situacao,
      cidade,
      uf,
      count(*)::bigint as pedidos,
      sum(valor_bruto)::numeric as valor_bruto,
      sum(valor_frete)::numeric as valor_frete,
      sum(valor_bruto - valor_frete)::numeric as valor_liquido
    from base_orders
    group by 1, 2, 3, 4, 5
  ), order_facts_json as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'data', data,
        'canal', canal,
        'situacao', situacao,
        'cidade', cidade,
        'uf', uf,
        'pedidos', pedidos,
        'valor_bruto', valor_bruto,
        'valor_frete', valor_frete,
        'valor_liquido', valor_liquido
      ) order by data, canal, situacao
    ), '[]'::jsonb) as payload
    from order_facts
  ), produto_fatos as (
    select
      o.data,
      o.canal,
      o.situacao,
      coalesce(i.id_produto_tiny, 0) as produto_id,
      nullif(i.codigo_produto, '') as sku,
      coalesce(nullif(i.nome_produto, ''), 'Produto sem nome') as descricao,
      sum(coalesce(i.quantidade, 0))::numeric as quantidade,
      sum(coalesce(i.valor_total, 0))::numeric as receita
    from base_orders o
    join public.tiny_pedido_itens i on i.id_pedido = o.id
    group by 1, 2, 3, 4, 5, 6
  ), produto_fatos_json as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'data', data,
        'canal', canal,
        'situacao', situacao,
        'produto_id', produto_id,
        'sku', sku,
        'descricao', descricao,
        'quantidade', quantidade,
        'receita', receita
      ) order by data, canal, situacao, produto_id
    ), '[]'::jsonb) as payload
    from produto_fatos
  ), totals as (
    select
      sum(pedidos)::bigint as total_pedidos,
      sum(valor_bruto)::numeric as total_valor,
      sum(valor_liquido)::numeric as total_valor_liquido,
      sum(valor_frete)::numeric as total_frete,
      (select coalesce(sum(quantidade)::numeric, 0) from produto_fatos) as total_produtos
    from order_facts
  )
  select payload into v_order_facts from order_facts_json;
  select payload into v_produto_facts from produto_fatos_json;
  select max(last_ts) into v_last_updated from base_orders;
  select total_pedidos, total_valor, total_valor_liquido, total_frete, total_produtos
    into v_total_pedidos, v_total_valor, v_total_liquido, v_total_frete, v_total_produtos
  from totals;

  delete from public.dashboard_resumo_cache
  where periodo_inicio = v_start and periodo_fim = v_end
    and canais_key = 'all' and situacoes_key = 'all';

  insert into public.dashboard_resumo_cache (
    periodo_inicio,
    periodo_fim,
    canais_key,
    situacoes_key,
    order_facts,
    produto_facts,
    payload,
    source_max_updated_at,
    built_at,
    expires_at,
    last_refreshed_at,
    total_pedidos,
    total_valor,
    total_valor_liquido,
    total_frete_total,
    total_produtos_vendidos
  ) values (
    v_start,
    v_end,
    'all',
    'all',
    coalesce(v_order_facts, '[]'::jsonb),
    coalesce(v_produto_facts, '[]'::jsonb),
    '{}'::jsonb,
    v_last_updated,
    now(),
    null,
    coalesce(v_last_updated, now()),
    coalesce(v_total_pedidos, 0),
    coalesce(v_total_valor, 0),
    coalesce(v_total_liquido, 0),
    coalesce(v_total_frete, 0),
    coalesce(v_total_produtos, 0)
  )
  on conflict (periodo_inicio, periodo_fim, canais_key, situacoes_key) do update set
    order_facts = excluded.order_facts,
    produto_facts = excluded.produto_facts,
    payload = excluded.payload,
    source_max_updated_at = excluded.source_max_updated_at,
    built_at = excluded.built_at,
    expires_at = excluded.expires_at,
    last_refreshed_at = excluded.last_refreshed_at,
    total_pedidos = excluded.total_pedidos,
    total_valor = excluded.total_valor,
    total_valor_liquido = excluded.total_valor_liquido,
    total_frete_total = excluded.total_frete_total,
    total_produtos_vendidos = excluded.total_produtos_vendidos;
end;
$$;
