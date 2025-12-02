## Cron de estoque/produtos (pg_cron → /api/admin/sync/produtos)

### Visão geral
- `pg_cron` agenda o job `tiny_produtos_backfill_hourly`, que executa `public.cron_run_produtos_backfill()` uma vez por hora.
- A função usa `pg_net.http_post` para chamar `https://gestor-tiny.vercel.app/api/admin/sync/produtos` com `mode: 'backfill'`, `modeLabel: 'backfill_cron'`, `limit: 10`, `workers: 1`, `enrichEstoque: false` e `cursorKey: 'catalog_backfill'`.
- `/api/admin/sync/produtos` delega para `syncProdutosFromTiny` (`src/lib/sync/produtos.ts`). Esse helper respeita rate limit, persiste estado em `produtos_sync_cursor` e grava telemetria em `sync_logs`.
- A UI segue consumindo `/api/produtos` e `/api/tiny/dashboard/resumo`, que refletem `tiny_produtos` após cada rodada do cron ou de execuções manuais.

### Cursor `catalog_backfill`
- A tabela `produtos_sync_cursor` mantém um registro por cursor. Hoje usamos:
  - `catalog`: incremental padrão por `data_alteracao` (modo cron/manual).
  - `catalog_backfill`: cursor dedicado ao backfill com offsets lineares.
- Para o backfill, o campo `updated_since` guarda um ISO derivado de `formatBackfillOffset(offsetEmSegundos)`. `syncProdutosFromTiny` converte esse valor de volta para segundos e usa como ponto inicial (`offsetStart`).
- Ao finalizar uma janela, `backfillNextOffset` é persistido novamente no mesmo campo. Quando o catálogo termina, reapontamos para `0` e o job volta para o início.

### Scripts úteis
| Script | Para que serve |
| --- | --- |
| `npx tsx scripts/runProdutosBackfill.ts [limit]` | Roda `syncProdutosFromTiny` em modo backfill manual, respeitando o mesmo cursor `catalog_backfill`. Use para acelerar lotes ou validar novos ajustes. |
| `npx tsx scripts/showProdutosCursor.ts [cursorKey]` | Mostra o registro atual em `produtos_sync_cursor` (default `catalog_backfill`). |
| `npx tsx scripts/resetProdutosCursor.ts [cursorKey]` | Zera `updated_since`/`latest_data_alteracao`. Útil quando queremos reiniciar a varredura. |
| `npx tsx scripts/showBackfillLogs.ts` | Lista os últimos logs `sync_produtos` em modo `backfill` com o cursor `catalog_backfill`. |
| `npx tsx scripts/applySupabaseSqlFile.ts supabase/migrations/20251202143000_update_produtos_backfill_payload.sql` | Aplica a migration que injeta `cursorKey: catalog_backfill` e mantém o cron em linha com o código. |

### Monitoramento
- **`sync_logs`**: cada execução de `syncProdutosFromTiny` grava um resumo (`message = 'sync_produtos'`) com estatísticas (`total429`, `offsetStart`, `backfillNextOffset`, etc.). `scripts/showBackfillLogs.ts` já filtra esse universo.
- **`cron_run_produtos_backfill`**: também insere um log (`message = 'cron_run_produtos_backfill dispatched via pg_cron'`) com o `request_id` retornado pelo `net.http_post`. Ajuda a correlacionar execuções HTTP.
- **Tabelas pg_cron**: use `select * from cron.job where jobname = 'tiny_produtos_backfill_hourly';` para conferir o schedule e `select * from cron.job_run_details where jobname = 'tiny_produtos_backfill_hourly' order by start_time desc limit 10;` para o histórico.

### Troubleshooting rápido
1. **Backfill parou de avançar**
   - Rode `npx tsx scripts/showProdutosCursor.ts` e confirme se `updated_since` continua aumentando. Caso esteja preso, use `npx tsx scripts/resetProdutosCursor.ts catalog_backfill` e execute `npx tsx scripts/runProdutosBackfill.ts 20` para reaquecer.
2. **Many 429 do Tiny**
   - Consulte os campos `total429`, `maxBackoffMs` e `windowUsagePct` no log. Se estiver alto, reduza temporariamente o limite passado pelo cron (alterar `limit` na migration) ou rode manualmente com `limit` menor.
3. **Cron não dispara**
   - Verifique se o `cron.job` ainda existe. Caso contrário, reaplique `supabase/migrations/20251129122000_cron_produtos_backfill.sql` (ou use `scripts/applySupabaseSqlFile.ts ...`).
4. **Precisa cobrir IDs específicos**
   - Execute o script `scripts/backfillProdutosByIds.ts` (detalhado em `scripts/README.md`) antes ou depois do backfill global.

### Fluxo manual recomendado
1. Verifique o cursor atual: `npx tsx scripts/showProdutosCursor.ts`.
2. Rode um lote manual (`npx tsx scripts/runProdutosBackfill.ts 40`) e aguarde o resumo (`offsetStart`, `backfillNextOffset`).
3. Consulte `scripts/showBackfillLogs.ts` para confirmar inserção no `sync_logs`.
4. Se tudo OK, deixe o cron seguir sozinho; ele continuará do último `backfillNextOffset` gravado.

### Variáveis de ambiente relevantes
- **Vercel**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TINY_CLIENT_ID`, `TINY_CLIENT_SECRET`, `TINY_REDIRECT_URI`, `DATABASE_URL` (para scripts que usam pg direto).
- **Supabase**: precisa do `pg_net` e `pg_cron` habilitados; a migration já executa `create extension if not exists`. Não há mais Edge Function para esse fluxo.

### Dicas gerais
- Respeite o limite da API do Tiny (~100 req/min). Mesmo com `limit: 10`, o backfill pode acumular 429 se rodarmos scripts paralelos; prefira deixar o cron serializado.
- Sempre aplique migrations relacionadas (20251129122000, 20251201090000, 20251202103000, 20251202143000) antes de mexer em produção — a versão atual depende do payload com `cursorKey: 'catalog_backfill'`.
- Quando precisar alterar frequência ou payload, gere uma migration nova para manter o histórico auditável.
