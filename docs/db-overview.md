# Visão Geral do Banco (Baseline v2 – apenas schema public)

## Grupos de Tabelas
- **sync_settings / sync_jobs / sync_logs**: controlam a orquestração e auditoria de jobs de sincronização.  
  - `sync_settings`: flags e parâmetros globais de sync.  
  - `sync_jobs`: cada execução (id UUID, status, params, métricas).  
  - `sync_logs`: logs por job, com nível, mensagem e meta (FK para `sync_jobs`).
- **tiny_orders / tiny_pedido_itens / tiny_produtos / tiny_tokens**: espelham dados do Tiny ERP.  
  - `tiny_orders`: pedidos trazidos do Tiny (valor, frete, canal, raw, geodados).  
  - `tiny_pedido_itens`: itens de cada pedido (FK para `tiny_orders` e opcionalmente para `tiny_produtos`).  
  - `tiny_produtos`: catálogo de produtos do Tiny (preço, estoque, imagem, fornecedor, embalagem).  
  - `tiny_tokens`: tokens OAuth do Tiny (access/refresh, expires_at).

## Relacionamentos Importantes
- `tiny_orders (PK id, UNIQUE tiny_id)`  
  ↳ `tiny_pedido_itens (FK id_pedido → tiny_orders.id)`  
  ↳ `tiny_pedido_itens (FK id_produto_tiny → tiny_produtos.id_produto_tiny, ON DELETE SET NULL)`  
  ↳ `tiny_produtos (UNIQUE id_produto_tiny)`
- `sync_jobs (PK id)`  
  ↳ `sync_logs (FK job_id → sync_jobs.id, ON DELETE CASCADE)`

Diagrama texto (simplificado):
```
sync_jobs (id) 1--* sync_logs (job_id)

tiny_orders (id, tiny_id unique)
    | 1--* tiny_pedido_itens (id_pedido)
    |            \--> tiny_produtos (id_produto_tiny unique)  [opcional, SET NULL]
tiny_tokens (id=1) [tokens OAuth Tiny]
```

## Funções e Triggers
- **set_updated_at()**: trigger genérico para carimbar `updated_at = now()` antes de UPDATE.  
  - Usado em `sync_settings`, `tiny_orders`, `tiny_produtos`.
- **update_tiny_produtos_updated_at()**: igual ao acima, específico para `tiny_produtos`.
- **tiny_orders_auto_sync_itens()**: trigger AFTER INSERT em `tiny_orders`; chama `net.http_post` para `/api/tiny/sync/itens` com o `tiny_id` inserido (pg_net).  
  - Triggers: `trg_tiny_orders_auto_sync_itens` (after insert), `trg_tiny_orders_updated_at` (before update), `trg_sync_settings_updated_at` (before update), `trigger_update_tiny_produtos_updated_at` (before update).
- **orders_metrics(...)**: função SQL estável que calcula métricas (totais, frete, líquido, contagem por situação) filtráveis por datas, canais, situações, texto.

## Segurança (RLS e Grants)
- **RLS ON** em todas as tabelas públicas: `tiny_orders`, `tiny_pedido_itens`, `tiny_produtos`, `tiny_tokens`, `sync_jobs`, `sync_logs`, `sync_settings`.
- **Policy service_role_full_access**: para cada tabela pública, libera FOR ALL para `service_role` com `USING (true) WITH CHECK (true)`.
- **Revogações**: `anon`/`authenticated` não têm permissão em tabelas, sequências ou funções críticas de public (revokes aplicados).  
- **Grants**: `service_role` recebe ALL em tabelas/seqs e EXECUTE nas funções principais (orders_metrics, triggers helpers).

## Como Usar no Desenvolvimento
- **Baseline v2** (`supabase/migrations/20251126000000_v2_public_baseline.sql`) é o estado de partida do schema public.  
- Novas mudanças de schema devem virar novas migrations (não edite a baseline).  
- Fluxo recomendado: criar migration → testar local com `supabase db reset` → só então `supabase db push --linked` no projeto correto.  
- O histórico remoto já está alinhado via `migration repair` (timestamp 20251126000000), não é necessário reaplicar a baseline no remoto.
