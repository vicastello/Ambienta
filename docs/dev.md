# Dev

## Smoke test do cache do Dashboard

Esse smoke test valida o fallback `schema_mismatch` (quando o schema do cache ainda não existe no Postgres) e o fluxo básico MISS→HIT do cache persistido do endpoint do dashboard.

### Pré-requisitos

- Supabase local rodando (`supabase start`)
- App rodando em outro terminal (`npm run dev`)

### Rodar

```bash
bash scripts/smoke-dashboard-cache.sh
```

### Variáveis (opcional)

- `DASHBOARD_URL` (default: `http://localhost:3000/api/tiny/dashboard/resumo`)
- `SUPABASE_DB_URL` (default: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`)
- `DASHBOARD_START` / `DASHBOARD_END` (default: `2025-12-01` e `2025-12-07`)

### O que o script faz

1. Renomeia `public.dashboard_resumo_cache` para `public.dashboard_resumo_cache__tmp_mismatch`
2. Faz `curl` no endpoint com período passado e valida:
   - HTTP 200
   - `X-Dashboard-Cache-Reason: schema_mismatch`
3. Renomeia a tabela de volta
4. Faz 2 requests iguais e valida:
   - Request #1: `X-Dashboard-Cache: MISS` e `X-Dashboard-Cache-Reason: cache_empty`
   - Request #2: `X-Dashboard-Cache: HIT` e `X-Dashboard-Cache-Reason: hit`

O script sai com exit code != 0 se qualquer assert falhar.
