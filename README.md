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
2. `lib/syncProcessor.ts` chama Tiny (`listarPedidosTinyPorPeriodo`), aplica backoff em 429 e usa `upsertOrdersPreservingEnriched` para não sobrescrever frete/canal/cidade/UF manualmente enriquecidos.
3. Pós-processamento automático: `runFreteEnrichment`, `normalizeMissingOrderChannels`, `sincronizarItensAutomaticamente`, além de `sync_produtos_from_tiny()` rodando a cada 2 min via pg_cron.
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
- **Pedidos/Produtos**: utilize `lib/staleCache.ts` (`staleWhileRevalidate`) para listas com paginação. Evite `fetch` direto com `cache: 'no-store'` quando já houver cache compartilhado.
- **Compras**: o PDF (`jspdf` + `jspdf-autotable`) é carregado dinamicamente. Mantenha feedback visual (`Gerando…`) para exportações pesadas e preserve o debounce de recalcular sugestões (350 ms) ao alterar filtros numéricos.
- **Rate Limits Tiny**: scripts já aplicam delay; não reduza `batchDelayMs` sem testar, ou os 429s quebram o job. Todos os writes em `tiny_orders` devem passar por `upsertOrdersPreservingEnriched`.

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
