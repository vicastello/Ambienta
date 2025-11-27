# Copilot Instructions · Gestor Tiny

## Big Picture
- Next.js App Router (TS, Tailwind 4) on Vercel; Supabase PG is the system of record; Tiny ERP is the upstream. UI is client-heavy and wrapped by `components/layout/AppLayout`.
- Core tables: `tiny_orders` (pedido/raw/cidade/uf), `tiny_pedido_itens`, `tiny_produtos`, `tiny_tokens` (id=1), `sync_jobs`/`sync_logs`; schema and pg_cron/pg_net functions live in `migrations/` and `supabase/migrations/` (e.g., `orders_metrics` RPC).

## Sync & Cron
- `POST /api/tiny/sync` enqueues `sync_jobs`; `lib/syncProcessor.ts` chunks date ranges, calls Tiny via `listarPedidosTinyPorPeriodo`, backs off on 429, upserts with `upsertOrdersPreservingEnriched` (keeps frete/canal/cidade/uf), then runs `runFreteEnrichment`, `normalizeMissingOrderChannels`, and `sincronizarItensAutomaticamente`.
- Frete enrichment also runs via `/api/tiny/sync/enrich-background` (pg_cron job in `20251122123000_cron_sync_itens_e_imagens.sql` hits it every 5m); inline enrichment is optional (`ENABLE_INLINE_FRETE_ENRICHMENT=false`) to respect Tiny’s ~100 req/min rate limit.
- Item sync: `sincronizarItensPorPedidos` plus trigger `trg_tiny_orders_auto_sync_itens` (`20251122124500_trigger_auto_sync_itens.sql`) POSTs `/api/tiny/sync/itens` whenever a `tiny_orders` row is inserted. `scripts/devCronServer.ts` mirrors the production cron locally and also normalizes channels.
- Products: pg_cron (`20251121120000_cron_sync_produtos.sql`) polls Tiny via SQL `sync_produtos_from_tiny()` every 2m; Vercel cron (`vercel.json`) refreshes Tiny tokens nightly; dev helpers `npm run dev:cron` / `./start-dev-cron.sh` simulate schedules.

## Tiny Auth
- OAuth: `/api/tiny/auth/login` → `/api/tiny/auth/callback` writes cookies and `tiny_tokens` (id=1). Always fetch tokens through `getAccessTokenFromDbOrRefresh` (needs `TINY_CLIENT_ID/SECRET/REDIRECT_URI`, optional `TINY_TOKEN_URL`) and log failures to `sync_logs`.
- Refresh surfaces: `/api/tiny/auth/refresh` (GET status / POST refresh), `/api/tiny/auth/save-token` for manual inserts, and `/api/admin/cron/refresh-tiny-token` (optional `CRON_SECRET`) for scheduled renewal.

## API Surfaces to Reuse
- `/api/orders` filters/paginates Supabase via `supabaseAdmin`, restricts sort to numero_pedido/data_criacao/valor/valor_frete, joins `tiny_pedido_itens` + `tiny_produtos.imagem_url` for item counts/first image, and wraps metrics with the `orders_metrics` RPC.
- `/api/tiny/dashboard/resumo` aggregates `tiny_orders` + persisted itens/produtos (with timezone handling and raw fallbacks) into `periodoAtual`, `periodoAnterior`, `canais`, `mapaVendasUF/Cidade`, `topProdutos`, `situacoesDisponiveis` consumed by `app/dashboard/page.tsx`.
- `/api/produtos` serves paged `tiny_produtos` using the service role; `/api/produtos/sync` pulls from Tiny (optional estoque enrichment). `/api/ai/insights` calls Gemini (`GEMINI_API_KEY` / `GOOGLE_GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_API_*`).

## UI Conventions
- Client components fetch through the APIs above (avoid direct Supabase in the UI); filters/cache keys are persisted (e.g., `tiny_dash_filters_v1`). Reuse `MultiSelectDropdown`, `BrazilSalesMap`, existing glassmorphism/gradient styles from `globals.css`.
- Map Tiny payloads with `tinyMapping` helpers (`normalizarCanalTiny`, `descricaoSituacao`, `parseValorTiny`, `extrairDataISO`, `TODAS_SITUACOES`) to keep status/channel labels consistent.

## Scripts & Ops
- Historical imports/backfills: `npm run sync:month -- --start=YYYY-MM-DD --end=YYYY-MM-DD` (also enriches frete/canais); other ops scripts live in `scripts/README.md` and are mainly for historical enrichment now that new pedidos already come enriched (frete + canal).
- Dev loop: `npm run dev` plus `npm run dev:cron` (or `npm run dev:full` with `concurrently`); logs go to `sync_logs` and `dev-cron.log`. Apply SQL in `supabase/migrations/` for pg_cron/pg_net jobs and `migrations/` for schema via the helper scripts if needed.

## Environment & Gotchas
- Required env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TINY_CLIENT_ID`, `TINY_CLIENT_SECRET`, `TINY_REDIRECT_URI`; optional: `TINY_TOKEN_URL`, `PROCESS_IN_APP`, `PROCESS_BATCH_DAYS`, `FRETE_ENRICH_MAX_PASSES`, `ENABLE_INLINE_FRETE_ENRICHMENT`, `CHANNEL_NORMALIZE_MAX_PASSES/BATCH`, `GEMINI_API_KEY`/`GOOGLE_GEMINI_API_KEY`, `GEMINI_API_BASE_URL`, `GEMINI_API_VERSION`, `CRON_SECRET`.
- Respect Tiny rate limits: keep batch sizes/delays from `runFreteEnrichment`, `sincronizarItensPorPedidos`, and Tiny list helpers or you’ll 429. When writing `tiny_orders`, go through `upsertOrdersPreservingEnriched` to avoid wiping enriched frete/canal/cidade/uf.
- Supabase cron/trigger SQL hardcodes `https://gestor-tiny.vercel.app`; update those migrations if the production domain changes.

Feedback welcome—if anything is unclear or missing, please shout and we’ll refine.
