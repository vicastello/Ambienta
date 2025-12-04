-- Otimizações de performance para /api/tiny/dashboard/resumo (etapa global)
-- Índices e função agregadora para séries de produtos

-- Índices para filtros/ordenações frequentes
create index if not exists tiny_orders_data_situacao_canal_idx
  on public.tiny_orders (data_criacao, situacao, canal);

create index if not exists tiny_pedido_itens_id_pedido_idx
  on public.tiny_pedido_itens (id_pedido);

create index if not exists tiny_pedido_itens_produto_idx
  on public.tiny_pedido_itens (id_produto_tiny);

-- Função agregadora para séries de produtos (reduz N+1 no Node)
create or replace function public.dashboard_produto_series(
  p_data_inicio date,
  p_data_fim date,
  p_canais text[] default null,
  p_situacoes int[] default null
) returns table (
  produto_id integer,
  codigo text,
  data date,
  quantidade numeric,
  receita numeric
) as $$
  select
    i.id_produto_tiny as produto_id,
    coalesce(i.codigo_produto, '') as codigo,
    (o.data_criacao::date) as data,
    sum(coalesce(i.quantidade, 0)) as quantidade,
    sum(
      coalesce(
        i.valor_total,
        coalesce(i.quantidade, 0) * coalesce(i.valor_unitario, 0),
        0
      )
    ) as receita
  from public.tiny_pedido_itens i
  join public.tiny_orders o on o.id = i.id_pedido
  where o.data_criacao >= p_data_inicio::timestamp
    and o.data_criacao <= (p_data_fim::timestamp + interval '23:59:59')
    and (p_canais is null or array_length(p_canais, 1) is null or o.canal = any(p_canais))
    and (p_situacoes is null or array_length(p_situacoes, 1) is null or o.situacao = any(p_situacoes))
  group by 1, 2, 3;
$$ language sql stable;

comment on function public.dashboard_produto_series is
  'Agrega séries de produtos por dia (quantidade/receita) para o dashboard, usada para evitar N+1 no Node';
