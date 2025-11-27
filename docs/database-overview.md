# Visão Técnica do Schema Public (Baseline v2)

## Tabelas e Colunas

### sync_settings
- id (integer, PK, not null)
- auto_sync_enabled (boolean, not null)
- auto_sync_window_days (integer, not null)
- created_at (timestamptz, null)
- updated_at (timestamptz, null)
- Papel: guarda configuração global da sincronização (flags e janela padrão).
- Índices: nenhum específico além da PK.

### sync_jobs
- id (uuid, PK, not null)
- started_at (timestamptz, not null, default now)
- finished_at (timestamptz, null)
- status (text, not null)
- error (text, null)
- params (jsonb, null)
- total_requests (integer, null, default 0)
- total_orders (integer, null, default 0)
- Papel: representa uma execução de sync (período, modo, métricas).
- Índices: PK.

### sync_logs
- id (bigserial, PK, not null)
- job_id (uuid, FK → sync_jobs.id ON DELETE CASCADE, null)
- created_at (timestamptz, not null, default now)
- level (text, not null)
- message (text, not null)
- meta (jsonb, null)
- Papel: log detalhado de cada job de sync.
- Índices: PK; FK para sync_jobs.

### tiny_orders
- id (bigint, PK, not null, default sequence)
- tiny_id (bigint, unique, not null)
- numero_pedido (integer, null)
- situacao (integer, null)
- data_criacao (date, null)
- valor (numeric(14,2), null)
- canal (text, null)
- cliente_nome (text, null)
- raw (jsonb, null)
- inserted_at (timestamptz, null)
- updated_at (timestamptz, null)
- last_sync_check (timestamptz, null)
- data_hash (varchar(32), null)
- is_enriched (boolean, null)
- valor_frete (numeric(10,2), null)
- cidade (text, null)
- uf (text, null)
- cidade_lat (double precision, null)
- cidade_lon (double precision, null)
- Papel: espelho dos pedidos do Tiny (dados brutos + enriquecidos).
- Índices principais: data_criacao, data_criacao DESC, data_criacao+situacao, canal, situacao, uf, flags de enriquecimento e frete (validação e performance de filtros).

### tiny_pedido_itens
- id (bigint, PK, not null, default sequence)
- id_pedido (integer, FK → tiny_orders.id ON DELETE CASCADE, not null)
- id_produto_tiny (integer, FK → tiny_produtos.id_produto_tiny ON DELETE SET NULL, null)
- codigo_produto (text, null)
- nome_produto (text, not null)
- quantidade (numeric(15,3), not null)
- valor_unitario (numeric(15,2), not null)
- valor_total (numeric(15,2), not null)
- info_adicional (text, null)
- created_at (timestamptz, null)
- Papel: itens de cada pedido (liga pedido ↔ produto).
- Índices: por id_pedido, id_produto_tiny, codigo_produto.

### tiny_produtos
- id (bigint, PK, not null, default sequence)
- id_produto_tiny (integer, unique, not null)
- codigo (text, null)
- nome (text, not null)
- unidade (text, null)
- preco (numeric(15,2), null)
- preco_promocional (numeric(15,2), null)
- saldo (numeric(15,3), null)
- reservado (numeric(15,3), null)
- disponivel (numeric(15,3), null)
- situacao (text, null)
- tipo (text, null)
- gtin (text, null)
- descricao (text, null)
- ncm (text, null)
- origem (text, null)
- peso_liquido (numeric(15,3), null)
- peso_bruto (numeric(15,3), null)
- data_criacao_tiny (timestamptz, null)
- data_atualizacao_tiny (timestamptz, null)
- created_at (timestamptz, null)
- updated_at (timestamptz, null)
- imagem_url (text, null)
- fornecedor_codigo (text, null)
- embalagem_qtd (numeric, null)
- Papel: catálogo de produtos do Tiny (estoque, preço, fornecedor, embalagem).
- Índices: codigo (btree), nome (GIN full-text), situacao, updated_at DESC.

### tiny_tokens
- id (integer, PK, default 1, not null)
- access_token (text, null)
- refresh_token (text, null)
- expires_at (bigint, null)
- scope (text, null)
- token_type (text, null)
- created_at (timestamptz, null)
- updated_at (timestamptz, null)
- Papel: guarda access/refresh tokens do Tiny.
- Índices: PK.

## Funções Principais
- **set_updated_at**: trigger genérico para carimbar `updated_at = now()` antes de UPDATE.
- **update_tiny_produtos_updated_at**: mesma lógica, específica para `tiny_produtos`.
- **tiny_orders_auto_sync_itens**: trigger AFTER INSERT em `tiny_orders` que chama `net.http_post` para `/api/tiny/sync/itens` com o `tiny_id` recém-inserido (pg_net).
- **orders_metrics**: função SQL estável que calcula totais de pedidos, frete, líquido e contagem por situação, com filtros por datas/canais/situações/search.

## Segurança (RLS / Policies / Grants)
- RLS habilitada em: `tiny_orders`, `tiny_pedido_itens`, `tiny_produtos`, `tiny_tokens`, `sync_jobs`, `sync_logs`, `sync_settings`.
- Policy `service_role_full_access`: para cada tabela public acima, libera FOR ALL para `service_role` (USING/with check true).
- Revogações: `anon` e `authenticated` não têm acesso às tabelas, sequências e funções críticas do schema public. Apenas `service_role` possui ALL/EXECUTE conforme baseline.

## Exemplos com Supabase Client (TS)
```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/db-public'; // ajustar caminho conforme uso

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Select paginado em tiny_orders
async function listarPedidos(page = 1, pageSize = 20) {
  const from = (page - 1) * pageSize;
  const { data, error } = await supabase
    .from('tiny_orders')
    .select('*')
    .range(from, from + pageSize - 1)
    .order('data_criacao', { ascending: false });
  if (error) throw error;
  return data;
}

// Chamada à função orders_metrics
async function obterMetricas() {
  const { data, error } = await supabase.rpc('orders_metrics', {
    p_data_inicial: null,
    p_data_final: null,
    p_canais: null,
    p_situacoes: null,
    p_search: null,
  });
  if (error) throw error;
  return data;
}
```

Use estes tipos e fluxo de acesso para manter as consultas tipadas e seguras, sempre respeitando as policies e o modelo de RLS definido.
