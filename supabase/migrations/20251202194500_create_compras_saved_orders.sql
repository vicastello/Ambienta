create table if not exists public.compras_saved_orders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  period_days integer not null default 60,
  target_days integer not null default 15,
  produtos jsonb not null default '[]'::jsonb,
  manual_items jsonb not null default '[]'::jsonb,
  item_count integer generated always as (
    coalesce(jsonb_array_length(produtos), 0) + coalesce(jsonb_array_length(manual_items), 0)
  ) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_compras_saved_orders_created_at
  on public.compras_saved_orders (created_at desc);

create index if not exists idx_compras_saved_orders_item_count
  on public.compras_saved_orders (item_count desc);

drop trigger if exists trg_compras_saved_orders_updated_at on public.compras_saved_orders;

create trigger trg_compras_saved_orders_updated_at
  before update on public.compras_saved_orders
  for each row
  execute function public.set_updated_at();
