-- Cria tabela simples para armazenar o cursor de catálogo do Tiny
set search_path = public;

create table if not exists public.produtos_sync_cursor (
  cursor_key text primary key,
  updated_since timestamptz,
  latest_data_alteracao timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.produtos_sync_cursor (cursor_key, updated_since, latest_data_alteracao)
values ('catalog', null, null)
on conflict (cursor_key) do nothing;
