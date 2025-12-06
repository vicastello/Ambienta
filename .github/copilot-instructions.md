# Guia rápido para IAs
## Linguagem & estilo
- Responda em português (Brasil), direto ao ponto, cite caminhos relativos (`app/...`, `lib/...`, `supabase/...`).
- Dê exemplos executáveis e explique o “porquê” no elo Tiny → Supabase; evite boilerplate genérico.

## Stack e forma de trabalhar
- Next.js 16 (App Router) + React 19 + Tailwind 4; layout em `components/layout/AppLayout*`, páginas em `app/**`, integrações em `lib/**`.
- Supabase Postgres é a fonte de verdade; Tiny ERP é o upstream. Tabelas-chave: `tiny_orders`, `tiny_pedido_itens`, `tiny_produtos`, `tiny_tokens`, `sync_settings/jobs/logs`.
- Rotas `app/api/**` usam repositórios em `src/repositories/**`; não consultar Supabase direto no client.

## Tiny → Supabase (pedidos)
- `POST /api/tiny/sync` → `lib/syncProcessor.ts`: fatia datas, chama Tiny (`listarPedidosTinyPorPeriodo`), aplica backoff 429 e persiste via `upsertOrdersPreservingEnriched`.
- Pós-passos obrigatórios em qualquer write em `tiny_orders`: `runFreteEnrichment` → `normalizeMissingOrderChannels` → `sincronizarItensAutomaticamente`.
- Dashboard `/api/tiny/dashboard/resumo` usa cache local; novos cards devem reutilizar `DashboardClient` + `readCacheEntry/isCacheEntryFresh`.

## Produtos, estoque e itens
- Fluxo oficial de produtos via HTTP: crons chamam `/api/admin/cron/sync-produtos` → `lib/tinyApi.ts`; a função SQL `sync_produtos_from_tiny()` foi aposentada (drop em `supabase/migrations/20251206120000_drop_sync_produtos_from_tiny.sql`). Cursores em `produtos_sync_cursor`.
- Itens: use `lib/pedidoItensHelper.ts` para garantir upsert de produtos antes de gravar `tiny_pedido_itens`.
- Normalização de canais: `lib/channelNormalizer.ts`. Respeite rate limit Tiny (~100 req/min) mantendo delays/batches existentes.

## Supabase e migrations
- Clientes: `lib/supabaseClient.ts` (browser) e `lib/supabaseAdmin.ts` (server/scripts) tipados com `src/types/db-public.ts`; nunca exponha `SUPABASE_SERVICE_ROLE_KEY`.
- Baseline imutável: `supabase/migrations/20251126000000_v2_public_baseline.sql`. Novo schema: `supabase migration new ...` → editar → `supabase db reset` (local) → `supabase db push --linked`.
- pg_cron/pg_net versionados em `supabase/migrations/**/*cron*.sql`; cron principal `/api/admin/cron/run-sync` (15 min) e `/api/admin/cron/sync-produtos` (2 min) usam tinyApi.

## Scripts úteis (dev/ops)
- Pedidos: `scripts/syncMonth.ts` (backfill), `scripts/enrichAll.ts` (frete/canal legado).
- Produtos: `scripts/syncProdutosInitial.ts`, `scripts/jobSyncProdutos.ts` (ou via API `/api/admin/cron/sync-produtos`).
- Cursores utilitários: `scripts/showProdutosCursor.ts`, `scripts/resetProdutosCursor.ts`.

## Execução e build
- Dev: `npm run dev` (app), `npm run dev:cron` (cron mock), `npm run dev:full` (ambos).
- Checks: `npm run lint`, `npm run build`.
- Autenticação Tiny: `/api/tiny/auth/login → callback` grava `tiny_tokens` (id=1); use `getAccessTokenFromDbOrRefresh` e logue falhas em `sync_logs`.

## Frontend/UX
- Estilo “liquid glass”: cards translúcidos, blur suave, destaque #009DA8; confira `app/globals.css` e `components/ui/**` antes de criar novos componentes.
- Mobile-first com `flex-col gap-4 px-4`; só adicione `md:` quando necessário. Listas/dashboards: `lib/staleCache.ts` + debounces existentes (ex.: 350 ms em `app/compras`).
