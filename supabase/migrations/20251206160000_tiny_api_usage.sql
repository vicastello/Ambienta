-- Cria tabela de auditoria de chamadas à Tiny v3
create table if not exists public.tiny_api_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  context text not null,
  endpoint text not null,
  method text not null default 'GET',
  status_code int,
  success boolean,
  error_code text,
  error_message text
);

create index if not exists idx_tiny_api_usage_created_context
  on public.tiny_api_usage (created_at desc, context);

create index if not exists idx_tiny_api_usage_created_endpoint
  on public.tiny_api_usage (created_at desc, endpoint);
