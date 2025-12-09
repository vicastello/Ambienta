# Guia rápido para IAs
- Responda em português (Brasil), direto ao ponto, citando caminhos relativos (`app/...`, `lib/...`, `supabase/...`). Evite boilerplate; explique sempre o elo Tiny → Supabase.

## Stack e arquitetura
- Next.js 16 (App Router) + React 19 + Tailwind 4; layout em `components/layout/AppLayout*`, páginas em `app/**`, integrações/helpers em `lib/**`.
- Supabase Postgres é a fonte de verdade; Tiny ERP é o upstream. Tabelas centrais: `tiny_orders`, `tiny_pedido_itens`, `tiny_produtos`, `tiny_tokens` (id=1), `sync_settings/jobs/logs`.
- Rotas `app/api/**` devem usar repositórios em `src/repositories/**`; evite `supabase.from(...)` direto no client.
- Clientes Supabase: `lib/supabaseClient.ts` (browser) e `lib/supabaseAdmin.ts` (server/scripts) tipados com `src/types/db-public.ts`; nunca exponha `SUPABASE_SERVICE_ROLE_KEY`.

## Fluxo Tiny → Supabase (pedidos)
- `POST /api/tiny/sync` chama `lib/syncProcessor.ts`: fatia datas, usa `tinyApi.listarPedidosTinyPorPeriodo` com backoff 429, e grava via `upsertOrdersPreservingEnriched`.
- Pós-passos obrigatórios após qualquer write em `tiny_orders`: `runFreteEnrichment` → `normalizeMissingOrderChannels` → `sincronizarItensAutomaticamente` (garante itens e canais). Mantenha delays/rate limit (~100 req/min).
- Itens passam por `lib/pedidoItensHelper.ts` para upsert de produtos antes de gravar `tiny_pedido_itens`.

## Produtos & estoque
- Fluxo oficial via HTTP/cron: `/api/admin/cron/sync-produtos` → `lib/tinyApi.ts`; cursores `catalog`/`catalog_backfill` em `produtos_sync_cursor`.
- Função SQL `sync_produtos_from_tiny()` está aposentada (drop em `supabase/migrations/20251206120000_drop_sync_produtos_from_tiny.sql`); não reativar nem usar SQL direto.
- Scripts úteis: `scripts/syncProdutosInitial.ts`, `scripts/jobSyncProdutos.ts`, `scripts/runProdutosBackfill.ts`, `scripts/showProdutosCursor.ts`, `scripts/resetProdutosCursor.ts`.

## Cron, migrations e dados
- Cron e pg_net versionados em `supabase/migrations/**/*cron*.sql` (ex.: `cron_run_tiny_sync` a cada 15 min, `cron_run_produtos_backfill`). Dev mock em `npm run dev:cron` ou `./start-dev-cron.sh`.
- Baseline imutável: `supabase/migrations/20251126000000_v2_public_baseline.sql`. Novo schema: `supabase migration new ...` → editar → `supabase db reset` (local) → `supabase db push --linked --include-all`.

## Caches e frontend
- Dashboard `/api/tiny/dashboard/resumo` usa `DashboardClient` com cache `localStorage` (`tiny_dash_state_v1:*`). Novos cards devem reutilizar `readCacheEntry/isCacheEntryFresh`.
- Listagens (pedidos/produtos/compras) usam `lib/staleCache.ts` (`staleWhileRevalidate`) e debounces existentes (ex.: 350 ms em `app/compras`).
- Estilo “liquid glass”: cards translúcidos com blur suave e destaque #009DA8; mantenha espaçamentos mobile-first (`flex-col gap-4 px-4`, só `md:` quando necessário). Confira `app/globals.css`, `components/ui/**`, `components/layout/AppLayout*` antes de criar UI nova.

## Execução e ops
- Dev: `npm run dev` (app), `npm run dev:cron` (cron mock), `npm run dev:full` (ambos).
- Checks obrigatórios: `npm run lint`, `npm run build` após alterações.
- Scripts de pedidos: `scripts/syncMonth.ts` (backfill por data), `scripts/enrichAll.ts` (frete/canal legado). Autenticação Tiny: `/api/tiny/auth/login → callback` grava `tiny_tokens`; tokens sempre via `getAccessTokenFromDbOrRefresh` e erros em `sync_logs`.
