-- Migration: create sync tables + tiny_tokens (idempotent)

-- Enable pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- =================================================
-- 1) sync_settings
-- =================================================
create table if not exists public.sync_settings (
  id integer primary key default 1,
  auto_sync_enabled boolean not null default false,
  auto_sync_window_days integer not null default 2, -- janela padrão p/ sync recente
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into public.sync_settings (id)
values (1)
on conflict (id) do nothing;

-- =================================================
-- 1.5) tiny_tokens (novo)
-- =================================================
create table if not exists public.tiny_tokens (
  id integer primary key default 1,
  access_token text,
  refresh_token text,
  expires_at bigint, -- epoch ms
  scope text,
  token_type text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into public.tiny_tokens (id) values (1) on conflict (id) do nothing;

-- =================================================
-- 2) tiny_orders + support
-- =================================================
create table if not exists public.tiny_orders (
  id bigserial primary key,
  tiny_id bigint not null unique,              -- id do Tiny (campo id)
  numero_pedido integer,
  situacao integer,
  data_criacao date,
  valor numeric(14,2),
  canal text,
  cliente_nome text,
  raw jsonb,                                   -- linha completa pra qualquer uso futuro
  inserted_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =================================================
-- 3) sync_jobs
-- =================================================
create table if not exists public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,                        -- queued | running | finished | error
  error text,
  params jsonb,
  total_requests integer default 0,
  total_orders integer default 0
);

-- =================================================
-- 4) sync_logs
-- =================================================
create table if not exists public.sync_logs (
  id bigserial primary key,
  job_id uuid references public.sync_jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  level text not null,                         -- info | warn | error
  message text not null,
  meta jsonb
);

-- =================================================
-- 5) set_updated_at function and triggers (idempotente)
-- =================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- trigger for sync_settings
drop trigger if exists trg_sync_settings_updated_at on public.sync_settings;
create trigger trg_sync_settings_updated_at
before update on public.sync_settings
for each row
execute function public.set_updated_at();

-- trigger for tiny_orders
drop trigger if exists trg_tiny_orders_updated_at on public.tiny_orders;
create trigger trg_tiny_orders_updated_at
before update on public.tiny_orders
for each row
execute function public.set_updated_at();

-- trigger for tiny_tokens
drop trigger if exists trg_tiny_tokens_updated_at on public.tiny_tokens;
create trigger trg_tiny_tokens_updated_at
before update on public.tiny_tokens
for each row
execute function public.set_updated_at();

-- =================================================
-- 6) Recommended indexes (idempotent if not exists)
-- =================================================
-- unique constraint on tiny_id already created by table definition,
-- but create indexes for query patterns:
create index if not exists idx_tiny_orders_data_criacao on public.tiny_orders (data_criacao);
create index if not exists idx_tiny_orders_situacao on public.tiny_orders (situacao);
create index if not exists idx_tiny_orders_canal on public.tiny_orders (canal);
-- index to speed up queries filtering by data_criacao + situacao (compound example)
create index if not exists idx_tiny_orders_data_situacao on public.tiny_orders (data_criacao, situacao);

-- Optional: small statistics refresh
analyze public.tiny_orders;
analyze public.sync_jobs;
analyze public.sync_logs;
analyze public.sync_settings;
analyze public.tiny_tokens;
