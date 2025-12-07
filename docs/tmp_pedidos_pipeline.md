# Pipeline de pedidos Tiny

## 1. Sincronização inicial (`/api/tiny/sync`)
- Endpoint em `app/api/tiny/sync/route.ts` cria um registro em `sync_jobs` e chama `lib/syncProcessor.processJob` (inline ou background, dependendo do `background` e da variável `PROCESS_IN_APP`).
- `lib/syncProcessor.ts`:
  • Chama `lib/tinyApi.ts` (`listarPedidosTinyPorPeriodo` ou `listarPedidosTiny`) para varrer a janela escolhida (batch de `PROCESS_BATCH_DAYS`).
  • Aplica `filtrarEMapearPedidos` + `upsertOrdersPreservingEnriched` (`lib/tinyMapping.ts` + `supabaseAdmin`) para gravar `tiny_orders`, preservando `valor_frete`, `canal`, `cidade/uf` já enriquecidos.
  • Loga tudo em `sync_logs` (status, janelas, 429, erros, total de pedidos).
  • Após persistir pedidos, chama `sincronizarItensPorPedidos` com retries/delay e, em caso de pedidos ainda sem itens, roda `sincronizarItensAutomaticamente` como fallback.
  • Enriquecimento pós-sync: `runFreteEnrichment` (via `lib/freteEnricher.ts`) e `normalizeMissingOrderChannels` (`lib/channelNormalizer.ts`).
- `src/services/tinySyncService.ts` oferece fluxo incremental (checkpoint em `sync_settings` + `listarPedidosTiny`). Ele chama `upsertOrder` e `upsertPedidoItens` diretamente (repositórios em `src/repositories`). É usado pelo `mode = 'incremental'` no `/api/tiny/sync`.
- Todas as chamadas à Tiny passam por `lib/tinyApi.ts` (`tinyGet`), que registra métricas em `tiny_api_usage` via `tinyUsageLogger`.

## 2. Schema e chaves
- `tiny_orders` (`src/types/db-public.ts`): campos principais `id` (PK bigint), `tiny_id`, `numero_pedido`, `data_criacao`, `valor`, `valor_frete`, `canal`, `raw/raw_payload`, `is_enriched`, `cidade`, `uf`, `cidade_lat`, `cidade_lon`, `inserted_at/updated_at`. `tiny_id` é o identificador Tiny usado em upserts e lookups.
- `tiny_pedido_itens`: `id` (PK), `id_pedido` (FK → `tiny_orders.id`), `id_produto_tiny`, `codigo_produto`, `nome_produto`, `quantidade`, `valor_unitario`, `valor_total`, `info_adicional`, `unidade`, `raw_payload`, `created_at`. A FK `tiny_pedido_itens_id_pedido_fkey` reforça a ligação com o pedido local.
- Todo o código vigente (helpers, repositórios, scripts) usa esses campos. Não existem referências a nomes obsoletos como `id_pedido_tiny`; mantenha esse mapeamento ao criar novas queries e prefira os tipos de `src/types/db-public.ts`.
- O script de auditoria `scripts/debugPedidosHoje.ts` (em criação) usará `data_criacao` para filtrar pedidos de hoje e `id_pedido` para contar itens, detectando rapidamente pedidos sem itens.

## 3. Pipeline de itens (`tiny_pedido_itens`)
- `app/api/tiny/sync/itens/route.ts` exige `tinyId`/`tinyIds`, obtém token (`tinyAuth`) e chama `sincronizarItensPorPedidos` (`lib/pedidoItensHelper.ts`).
- `lib/pedidoItensHelper.ts`:
  • `sincronizarItensPorPedidos` busca os pedidos locais (`tiny_orders`) correspondentes, identifica quais ainda não têm itens e invoca `salvarItensPedido` para cada um.
  • `salvarItensPedido` usa `obterPedidoDetalhado` (`tinyApi`) para reconstruir o payload completo, mapeia campos (`id_pedido`, `id_produto_tiny`, `quantidade`, `valor_unitario`, `valor_total`, etc.) e insere em `tiny_pedido_itens`.
  • Fallback: se o pedido não retornar itens, tenta extrair do `raw` armazenado em `tiny_orders`.
  • Antes de inserir, garante que os produtos existam (`ensureProdutosNoCatalog`) e atualiza estoque (`atualizarEstoqueProdutos`).
  • `salvarItensLote` e `sincronizarItensAutomaticamente` controlam delays e retries para respeitar o limite ~100 req/min.
- Gatilho automático: `supabase/migrations/20251122124500_trigger_auto_sync_itens.sql` (também em `supabase-export/supabase/migrations/20251122124500_trigger_auto_sync_itens.sql`) define a função `tiny_orders_auto_sync_itens()` e o trigger `trg_tiny_orders_auto_sync_itens`. Ele usa `pg_net.http_post` para chamar `https://gestor-tiny.vercel.app/api/tiny/sync/itens` imediatamente após cada inserção em `tiny_orders`.
- O fallback `sincronizarItensAutomaticamente` é usado em `lib/syncProcessor.ts` e pode ser acionado manualmente via scripts/cron (ex.: `scripts/syncPedidoItens.ts`).

## 4. Enrichment e logging
- `lib/orderEnricher.ts` busca `valorFrete` detalhado para pedidos que não têm freight na listagem (acionado quando `ENABLE_INLINE_FRETE_ENRICHMENT=true`).
- `lib/freteEnricher.ts` monitora pedidos sem frete, busca detalhes e atualiza `valor_frete`/`raw/is_enriched`. O cron `/api/tiny/sync/enrich-background` (migration `20251122123000_cron_sync_itens_e_imagens.sql`) garante que esses pedidos sejam processados periodicamente.
- `lib/tinyApi.ts` é o único cliente HTTP da Tiny. Todas as chamadas passam por `tinyGet`, que loga sucesso/erro no `tiny_api_usage` via `tinyUsageLogger.ts` (contextos como `cron_pedidos`, `pedido_helper`, `pedido_itens_helper`).
- `sync_logs` registra cada etapa de um `sync_job` (janelas, 429, fallback de itens, enrich, erros). É a referência principal para investigar pedidos "quebrados".

## 5. Scripts auxiliares
- `scripts/syncMonth.ts`, `scripts/enrichAll.ts`, `scripts/jobSyncProdutos.ts` usam esses helpers para backfills ou para simular o cron local (`scripts/devCronServer.ts`).
- Ganchos adicionais como `scripts/syncPedidoItens.ts`, `scripts/forceSyncItensRecent.ts` e `scripts/checkItensRecent.ts` podem ser adaptados para rodar o novo job de correção.
- A trigger `tiny_orders_auto_sync_itens` garante que qualquer inserção nova (sync, manual, import) dispare `/api/tiny/sync/itens`.
- A rota `app/api/admin/cron/fix-pedido-itens` (protegida por `CRON_SECRET`) lista pedidos dos últimos dias sem itens e reaplica `sincronizarItensPorPedidos` com `context: 'cron_fix_missing_itens'`, registrando o resultado em `sync_logs`. Use também `scripts/fixMissingPedidoItens.ts` para execuções manuais.

## 6. Rotina de correção automática de itens faltando
- Auditoria rápida (hoje ou últimos N dias):
  - `npx tsx scripts/debugPedidosHoje.ts` (hoje)
  - `npx tsx scripts/debugPedidosHoje.ts --days 3` (últimos 3 dias)
- Correção manual via CLI (defaults recomendados: dias=3, limit=400, retries=3, delay=800ms, force=on):
  - `npx tsx scripts/fixMissingPedidoItens.ts --days 2 --limit 200`
  - sem flags mantém compatibilidade: `npx tsx scripts/fixMissingPedidoItens.ts`
- Rota HTTP para cron externo/pg_net (usa o mesmo helper + logging em `sync_logs`):
  ```bash
  curl -X POST "https://<host-da-app>/api/admin/cron/fix-pedido-itens" \
    -H "x-cron-secret: $CRON_SECRET" \
    -d '{"dias":3,"limit":400,"force":true}'
  ```
- A rota responde com `{ success, correctedCount, stillMissingCount, checkedDays, limit }`. Em caso de erro, retorna 500 e loga o detalhe em `sync_logs`.

## 7. Pontos críticos identificados até aqui
1. Qualquer pedido persistido só terá itens após `sincronizarItensPorPedidos`. Em caso de erro ou 429, o job atual apenas loga e tenta `sincronizarItensAutomaticamente` como fallback.
2. A trigger `tiny_orders_auto_sync_itens` usa o domínio fixo `gestor-tiny.vercel.app`. Em ambientes diferentes (preview, local) essa chamada pode falhar silenciosamente.
3. `tinyApi` e `pedidoItensHelper` fazem retries, mas não logam cada pedido falho com contexto estruturado, o que dificulta auditoria.
4. Ainda falta um job periódico para detectar `tiny_orders` sem itens e reaplicar `sincronizarItensPorPedidos` com logs e retries claros.

*Próximo passo:* validar colunas e chaves (já descrito acima) e criar `scripts/debugPedidosHoje.ts` + o job de fix para garantir que pedidos de hoje nunca fiquem sem itens.
