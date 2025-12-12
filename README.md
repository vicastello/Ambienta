# Gestor Tiny · Ambienta

> Painel interno da Ambienta que centraliza pedidos do Tiny ERP, sincroniza estoque/produtos no Supabase e expõe dashboards (App Router + Tailwind 4) hospedados na Vercel.

## Visão Geral
- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind 4. Todos os fluxos passam por `components/layout/AppLayout` e consomem APIs do próprio app (evitar Supabase direto no cliente).
- **Backend**: Rotas `/api/*` e scripts em `lib/` falam com Supabase via `supabaseAdmin`. O Tiny ERP é a fonte upstream; Supabase é a fonte de verdade.
- **Sincronização**: `POST /api/tiny/sync` agendado via pg_cron (`supabase/migrations/**/*cron*.sql`). Após cada import, o pipeline roda enriquecimento de frete, normalização de canais e sincroniza itens/produtos.
- **Dashboards**: `/dashboard` agrega `tiny_orders`, `tiny_pedido_itens` e `tiny_produtos` (com cache local em `localStorage`). Pedidos, produtos e compras usam `staleWhileRevalidate` para reduzir requisições repetidas.

## Stack & Pastas
| Pasta | Descrição |
| --- | --- |
| `app/` | Rotas App Router e componentes client-heavy (dashboard, pedidos, produtos, compras). |
| `components/` | UI compartilhada (`AppLayout`, mapas, dropdowns). |
| `lib/` | Integrações (Tiny, Supabase, enrichement helpers, caches). |
| `scripts/` | Ferramentas operacionais (`syncMonth`, `devCronServer`, backfills). |
| `supabase/` & `migrations/` | Schema, pg_cron e funções (`orders_metrics`, `cron_run_tiny_sync`). |
| `docs/` | Fluxos operacionais (sync, estoque, banco). |

## Pipeline Tiny → Supabase
1. `POST /api/tiny/sync` ou `npm run sync:month -- --start=YYYY-MM-DD --end=YYYY-MM-DD` agrupa a janela desejada e enfileira `sync_jobs`.
2. `lib/syncProcessor.ts` chama Tiny (`listarPedidosTinyPorPeriodo`) via `tinyApi.ts` (tudo logado em `tiny_api_usage`), aplica backoff em 429 e usa `upsertOrdersPreservingEnriched` para não sobrescrever frete/canal/cidade/UF manualmente enriquecidos.
3. Pós-processamento automático: `runFreteEnrichment`, `normalizeMissingOrderChannels`, `sincronizarItensAutomaticamente` e o sync de produtos via `/api/admin/sync/produtos` (cron `cron_run_produtos_backfill` + cursor `catalog_backfill`, passando pelo `lib/tinyApi.ts`). A antiga função SQL `sync_produtos_from_tiny()` foi aposentada (veja `supabase/migrations/20251206120000_drop_sync_produtos_from_tiny.sql` e script legacy `scripts/applyViaSql.ts` está bloqueado).
4. `/api/tiny/dashboard/resumo` agrega períodos atuais/anterior + canais/mapa, respeitando timezone `America/Sao_Paulo` e itens persistidos.

> **Produção**: `public.cron_run_tiny_sync()` (definida em `supabase/migrations/20251128120000_cron_run_tiny_sync.sql`) chama `POST https://gestor-tiny.vercel.app/api/admin/cron/run-sync` a cada 15 min (`cron.schedule('tiny_sync_every_15min', '*/15 * * * *', ...)`). Ajuste a frequência alterando a migration ou executando `cron.unschedule/cron.schedule` direto no banco. O Vercel Cron ficou restrito a tarefas diárias (ex.: refresh de token).

## Ambiente & Execução
1. **Instalação**
	```bash
	npm install
	cp .env.vercel.example .env.local # preencha chaves Tiny/Supabase
	```
2. **Desenvolvimento**
	```bash
	npm run dev           # App Router
	npm run dev:cron      # Cron local (pg_cron mock)
	npm run dev:full      # Ambos via concurrently
	```
3. **Checagens**
	```bash
	npm run lint
	npm run build
	```

### Variáveis obrigatórias
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TINY_CLIENT_ID`, `TINY_CLIENT_SECRET`, `TINY_REDIRECT_URI`. Opcionais: `TINY_TOKEN_URL`, `PROCESS_IN_APP`, `PROCESS_BATCH_DAYS`, `FRETE_ENRICH_MAX_PASSES`, `ENABLE_INLINE_FRETE_ENRICHMENT`, `CHANNEL_NORMALIZE_MAX_PASSES`, `CHANNEL_NORMALIZE_BATCH`, `GEMINI_API_KEY`/`GOOGLE_GEMINI_API_KEY`, `GEMINI_API_BASE_URL`, `GEMINI_API_VERSION`, `CRON_SECRET`.

## Runtime & UX Notes
- **Dashboard Cache**: `DashboardClient` usa `localStorage` (`tiny_dash_state_v1:*`) para resumo/global/situações/gráfico com validade de ~2 min. Reaproveite `readCacheEntry`/`isCacheEntryFresh` ao criar novos cards para não aumentar a pressão no endpoint `/api/tiny/dashboard/resumo`.
- **Pedidos/Produtos**: utilize `lib/staleCache.ts` (`staleWhileRevalidate`) para listas com paginação. Evite `fetch` direto com `cache: 'no-store'` quando já houver cache compartilhado. Para pedidos, há endpoints admin de manutenção:
  - `/api/admin/pedidos/retry-itens` — reprocessa pedidos sem itens ou sem código/id de produto.
  - `/api/admin/pedidos/update-produtos` — dado um conjunto de pedidos (por `since`, `limit` ou lista), extrai ids de produto (itens + raw) e atualiza catálogo/estoque com retry/backoff.
  - `/api/admin/produtos/fetch-by-ids` — wrapper HTTP do script para buscar produtos específicos no Tiny (detalhe + estoque) com retries 429/401.
- **Itens com produto garantido**: `lib/pedidoItensHelper.ts` agora garante que produtos referenciados existam no catálogo: se um `id_produto_tiny` não estiver em `tiny_produtos`, ele chama Tiny (`obterProduto` + `obterEstoqueProduto`) e faz `upsertProduto` antes de gravar os itens (aplica tanto no fluxo normal quanto no fallback do `raw`).
- **Compras**: o PDF (`jspdf` + `jspdf-autotable`) é carregado dinamicamente. Mantenha feedback visual (`Gerando…`) para exportações pesadas e preserve o debounce de recalcular sugestões (350 ms) ao alterar filtros numéricos.
- **Rate Limits Tiny**: scripts já aplicam delay; não reduza `batchDelayMs` sem testar, ou os 429s quebram o job. Todos os writes em `tiny_orders` devem passar por `upsertOrdersPreservingEnriched`.

### Relatórios / Kits & Marketplaces
- **Fonte de verdade = marketplace** para vendas de kit: no handler `/api/reports/sales` os itens do marketplace são usados diretamente quando existem; só caímos no fallback do Tiny quando não há itens do marketplace. Kits não são mais “inferidos” a partir de componentes do Tiny se o marketplace disser que a venda é avulsa.
- **Comparar unitário vs kit**: `npx tsx scripts/report-kit-vs-unit.ts 2025-11-01 2025-11-30` gera a lista de pedidos com diferença (útil para auditar ruídos de centavos ou packs do Mercado Livre).
- **Dedup de itens do Meli**: `npx tsx scripts/cleanup-meli-items.ts` remove duplicatas por `(meli_order_id, sku, unit_price)` em `meli_order_items` (evita contabilizar duas vezes no relatório). Se houver packs, rode antes `npx tsx scripts/meli-link-pack-orders.ts` para garantir que todos os pedidos irmãos estão vinculados ao mesmo pedido Tiny.
- **Re-sync Meli**: `npx tsx scripts/refresh-meli-token.ts` para renovar token e `npx tsx scripts/sync-meli-now.ts` (ou `fetch` para `/api/marketplaces/mercado-livre/sync`) com `force:true` e janela personalizada.

## Produtos & Estoque
- **Round-robin de estoque**: cron `/api/tiny/cron/estoque-round-robin` roda a cada 5 min com `batchSize` padrão 200 (clamp em `MAX_PRODUCTS_PER_JOB=200`). Respeita ~120 req/min com `BASE_REQUEST_DELAY_MS=450ms`, tolera até `MAX_429_PER_JOB=8` (delay 3s em cada 429) e avança o cursor apenas até o último sucesso.
- **Catálogo**: `cron_run_produtos_backfill` (migration `20251129122000*` + ajustes `20251202*`) chama `/api/admin/sync/produtos` em modo backfill com `limit: 10`, `workers: 1` e `cursorKey: 'catalog_backfill'`. Para evitar bater demais em `/produtos`, o rate limiter agora trava em ~90 req/min (estoque-only em ~110 req/min) e o cron deve rodar poucas vezes ao dia ou manualmente.
- Há dois cursores ativos: `catalog` (incremental por `latest_data_alteracao`) e `catalog_backfill` (offset/epoch). O cron só mexe no segundo; execuções manuais podem escolher um deles passando `cursorKey`.
- Scripts úteis:
	- `npx tsx scripts/runProdutosBackfill.ts [limit]` — roda uma janela manual em modo backfill e atualiza o cursor.
	- `npx tsx scripts/showProdutosCursor.ts [cursorKey]` — inspeciona o registro em `produtos_sync_cursor`.
	- `npx tsx scripts/resetProdutosCursor.ts [cursorKey]` — zera `updated_since`/`latest_data_alteracao` para reiniciar a varredura.
	- `npx tsx scripts/showBackfillLogs.ts` — lista os últimos `sync_logs` com `mode: backfill`/`cursorKey: catalog_backfill`.
- Mais detalhes (monitoramento, troubleshooting e env vars) em `docs/estoque-cron.md`.

## Backups
- **Local**: gere um tarball excluindo `.git`, `node_modules`, `.next` e backups antigos.
  ```bash
  tar --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='backup-gestor-tiny-*' \
		-czf backup-gestor-tiny-$(date +%Y%m%d).tar.gz .
  ```
- **Banco**: utilize `supabase export` ou os dumps em `supabase-export/`. A pasta `supabase-backup-antes-sync/` fica fora do git por ser pesada.

## Documentação complementar
- `docs/` — guias de sincronização, estoque, migrations e visão do banco.
- `SINCRONIZACAO.md` — detalhes do pipeline de pedidos/frete/canais.
- `SUPABASE_CRON_GUIDE.md` — manutenção dos cron jobs.
- `.github/copilot-instructions.md` — resumo sempre atualizado para IA/colaboradores.

Contribuições e melhorias são bem-vindas! Abra uma issue ou PR descrevendo alterações e testes executados.
