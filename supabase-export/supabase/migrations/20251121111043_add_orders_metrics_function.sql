create or replace function public.orders_metrics(
	p_data_inicial date default null,
	p_data_final date default null,
	p_canais text[] default null,
	p_situacoes int[] default null,
	p_search text default null
)
returns table (
	total_orders bigint,
	total_bruto numeric,
	total_frete numeric,
	total_liquido numeric,
	situacao_counts jsonb
) as $$
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
$$ language sql stable;
