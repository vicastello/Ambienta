# tiny_api_usage – monitoramento de chamadas Tiny v3

Tabela `public.tiny_api_usage` registra **todas** as chamadas Tiny feitas pelo Node/Next (sempre via `lib/tinyApi.ts`).

Campos principais:
- `context`: origem da chamada (ex.: `cron_pedidos`, `api_pedidos_sync`, `cron_produtos`, `cron_estoque_round_robin`, `api_estoque_produto`, `pedido_itens_helper`, `scripts/enrichToday`).
- `endpoint`: rota Tiny usada (`/pedidos`, `/pedidos/{id}`, `/produtos`, `/produtos/{id}`, `/estoque/{id}`).
- `method`: verbo HTTP (hoje só GET).
- `status_code`: status HTTP retornado pelo Tiny.
- `success`: boolean indicando se `res.ok`.
- `error_code` / `error_message`: detalhes em caso de falha (inclui rate limit 429).

Contextos importantes hoje:
- **Pedidos**: `cron_pedidos`, `api_pedidos_sync`, `cron_pedidos_incremental`.
- **Itens/Enrich**: `pedido_itens_helper`, `pedido_helper` (detalhe), `cron_pedidos` (enrich inline), `runFreteEnrichment`.
- **Produtos**: `cron_produtos` (catálogo com rate limit interno ~90 req/min), `api_produtos_refresh`, `backfill_cron`.
- **Estoque**: `cron_estoque_round_robin` (batchSize padrão 200, cap 200, delay 450ms/req + 3s em 429 até 8 vezes), `api_estoque_produto`, `pedido_itens_helper`.

Consultas úteis (executar no Supabase):

```sql
-- Chamadas por contexto nas últimas 24h
select
  context,
  count(*) as total_calls,
  sum(case when success then 1 else 0 end) as ok_calls,
  sum(case when not success then 1 else 0 end) as error_calls
from public.tiny_api_usage
where created_at >= now() - interval '24 hours'
group by context
order by total_calls desc;

-- Chamadas por endpoint (e quantos 429) nas últimas 24h
select
  endpoint,
  count(*) as total_calls,
  sum(case when status_code = 429 then 1 else 0 end) as rate_limits
from public.tiny_api_usage
where created_at >= now() - interval '24 hours'
group by endpoint
order by total_calls desc;

-- Timeline por hora e contexto (últimas 24h)
select
  date_trunc('hour', created_at) as hora,
  context,
  count(*) as total_calls
from public.tiny_api_usage
where created_at >= now() - interval '24 hours'
group by hora, context
order by hora desc, context;

-- Contextos que mais geram 429 (últimas 24h)
select context, count(*) filter (where status_code = 429) as total_429
from public.tiny_api_usage
where created_at >= now() - interval '24 hours'
group by context
having count(*) filter (where status_code = 429) > 0
order by total_429 desc;

-- Latência entre chamadas por endpoint/contexto (últimas 6h)
select endpoint, context,
  avg(extract(epoch from (created_at - lag(created_at) over (partition by endpoint, context order by created_at)))*1000) as avg_ms_between_calls
from public.tiny_api_usage
where created_at >= now() - interval '6 hours'
group by endpoint, context
order by avg_ms_between_calls asc;
```
