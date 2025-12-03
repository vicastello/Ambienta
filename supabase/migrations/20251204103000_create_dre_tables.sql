-- DRE (Demonstração de Resultado) - tabelas, seed inicial e RLS/policies
-- Não altera baseline v2. Novas tabelas: dre_periods, dre_categories, dre_values.

-- Tabela de períodos (mês/ano) da DRE
create table if not exists public.dre_periods (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null,
  label text not null,
  status text not null default 'draft', -- draft | closed
  target_net_margin numeric(10,4),      -- meta de margem líquida (fração, ex: 0.12)
  reserve_percent numeric(10,4),        -- percentual de reserva sobre lucro líquido (fração)
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint dre_periods_month_check check (month between 1 and 12),
  constraint dre_periods_unique_month unique (year, month)
);

create index if not exists idx_dre_periods_year_month_desc
  on public.dre_periods (year desc, month desc);

-- Tabela de categorias (linhas da DRE)
create table if not exists public.dre_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  group_type text not null, -- RECEITA | CUSTO_VARIAVEL | DESPESA_FIXA | DESPESA_OPERACIONAL | OUTROS
  sign text not null,       -- ENTRADA | SAIDA
  is_default boolean not null default true,
  is_editable boolean not null default true,
  order_index integer not null default 0,
  channel text null,        -- SHOPEE | MERCADO_LIVRE | MAGALU | null
  parent_code text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_dre_categories_group_order
  on public.dre_categories (group_type, order_index);

-- Valores por categoria em cada período
create table if not exists public.dre_values (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.dre_periods(id) on delete cascade,
  category_id uuid not null references public.dre_categories(id) on delete restrict,
  amount_auto numeric(14,2),
  amount_manual numeric(14,2),
  final_amount numeric(14,2) generated always as (coalesce(amount_manual, amount_auto, 0)) stored,
  auto_source text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint dre_values_unique_period_category unique (period_id, category_id)
);

create index if not exists idx_dre_values_period_id
  on public.dre_values (period_id);

create index if not exists idx_dre_values_category_id
  on public.dre_values (category_id);

-----------------------------
-- Triggers de updated_at
-----------------------------
drop trigger if exists trg_dre_periods_updated_at on public.dre_periods;
create trigger trg_dre_periods_updated_at
  before update on public.dre_periods
  for each row
  execute function public.set_updated_at();

drop trigger if exists trg_dre_categories_updated_at on public.dre_categories;
create trigger trg_dre_categories_updated_at
  before update on public.dre_categories
  for each row
  execute function public.set_updated_at();

drop trigger if exists trg_dre_values_updated_at on public.dre_values;
create trigger trg_dre_values_updated_at
  before update on public.dre_values
  for each row
  execute function public.set_updated_at();

-----------------------------
-- Seed inicial de categorias padrão
-----------------------------
insert into public.dre_categories (code, name, group_type, sign, order_index, channel, is_default, is_editable)
values
  ('VENDAS', 'Vendas', 'RECEITA', 'ENTRADA', 10, null, true, true),
  ('REEMBOLSOS_DEVOLUCOES', 'Reembolsos / Devoluções', 'RECEITA', 'SAIDA', 20, null, true, true),
  ('RESSARCIMENTO_DEVOLUCOES', 'Ressarcimento de Devoluções', 'RECEITA', 'ENTRADA', 30, null, true, true),
  ('CMV_IMPOSTOS', 'CMV + Impostos', 'CUSTO_VARIAVEL', 'SAIDA', 40, null, true, true),
  ('TARIFAS_SHOPEE', 'Tarifas Shopee', 'CUSTO_VARIAVEL', 'SAIDA', 50, 'SHOPEE', true, true),
  ('TARIFAS_MERCADO_LIVRE', 'Tarifas Mercado Livre', 'CUSTO_VARIAVEL', 'SAIDA', 60, 'MERCADO_LIVRE', true, true),
  ('TARIFAS_MAGALU', 'Tarifas Magalu', 'CUSTO_VARIAVEL', 'SAIDA', 70, 'MAGALU', true, true),
  ('COOP_FRETES_MAGALU', 'Cooparticipação Fretes Magalu', 'CUSTO_VARIAVEL', 'SAIDA', 80, 'MAGALU', true, true),
  ('FRETES', 'Fretes', 'CUSTO_VARIAVEL', 'SAIDA', 90, null, true, true),
  ('CONTADOR', 'Contador', 'DESPESA_FIXA', 'SAIDA', 100, null, true, true),
  ('OUTROS_CUSTOS', 'Outros Custos', 'DESPESA_FIXA', 'SAIDA', 110, null, true, true),
  ('SISTEMA_ERP', 'Sistema ERP', 'DESPESA_FIXA', 'SAIDA', 120, null, true, true),
  ('INTERNET', 'Internet', 'DESPESA_FIXA', 'SAIDA', 130, null, true, true),
  ('IA', 'IA', 'DESPESA_FIXA', 'SAIDA', 140, null, true, true),
  ('MARKETING_PUBLICIDADE', 'Marketing e Publicidade (Anúncios)', 'DESPESA_OPERACIONAL', 'SAIDA', 150, null, true, true),
  ('MATERIAIS_EMBALAGEM', 'Materiais de Embalagem', 'CUSTO_VARIAVEL', 'SAIDA', 160, null, true, true),
  ('COMBUSTIVEIS', 'Combustíveis', 'DESPESA_OPERACIONAL', 'SAIDA', 170, null, true, true)
on conflict (code) do update set
  name = excluded.name,
  group_type = excluded.group_type,
  sign = excluded.sign,
  order_index = excluded.order_index,
  channel = excluded.channel,
  is_default = true,
  is_editable = excluded.is_editable,
  updated_at = timezone('utc', now());

-----------------------------
-- RLS + Policies
-----------------------------
alter table public.dre_periods enable row level security;
alter table public.dre_categories enable row level security;
alter table public.dre_values enable row level security;

do $$
declare
  tbl text;
begin
  for tbl in select unnest(array['dre_periods', 'dre_categories', 'dre_values']) loop
    execute format('drop policy if exists service_role_full_access on public.%I;', tbl);
    execute format(
      'create policy service_role_full_access on public.%I for all to service_role using (true) with check (true);',
      tbl
    );
  end loop;
end $$;

-----------------------------
-- Grants/Revokes
-----------------------------
revoke all on table public.dre_periods from anon, authenticated;
revoke all on table public.dre_categories from anon, authenticated;
revoke all on table public.dre_values from anon, authenticated;

grant all on table public.dre_periods, public.dre_categories, public.dre_values to service_role;

-----------------------------
-- Comments (documentação rápida)
-----------------------------
comment on table public.dre_periods is 'Períodos mensais da DRE (rascunho/fechado, metas e reservas).';
comment on table public.dre_categories is 'Categorias (linhas) da DRE, incluindo grupos, sinal (entrada/saída) e canal opcional.';
comment on table public.dre_values is 'Valores por período e categoria; final_amount é coalesce(manual, auto, 0).';

comment on column public.dre_values.final_amount is 'Valor final calculado (manual > auto > 0).';

