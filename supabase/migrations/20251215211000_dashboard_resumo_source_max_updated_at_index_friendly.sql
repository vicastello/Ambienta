-- Ajuste index-friendly do watermark do dashboard
-- Troca: max(greatest(updated_at, inserted_at)) -> greatest(max(updated_at), max(inserted_at))
-- E adiciona indice opcional para acelerar MAX(updated_at) quando aplicavel.

set search_path = public, extensions;

-- Indice auxiliar (opcional) quando updated_at e o principal marcador de mudanca.
create index if not exists tiny_orders_updated_at_desc_idx
  on public.tiny_orders (updated_at desc);

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
  with base as (
    select updated_at, inserted_at
    from public.tiny_orders
    where data_criacao >= p_data_inicial
      and data_criacao <= p_data_final
      and (p_canais is null or canal = any(p_canais))
      and (p_situacoes is null or situacao = any(p_situacoes))
  )
  select greatest(
    coalesce((select max(updated_at) from base), '-infinity'::timestamptz),
    coalesce((select max(inserted_at) from base), '-infinity'::timestamptz)
  );
$$;
