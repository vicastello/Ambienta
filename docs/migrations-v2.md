# Guia de Migrations v2 (Ambienta)

## O que é a baseline v2
- Arquivo: `supabase/migrations/20251126000000_v2_public_baseline.sql`.
- Cobre apenas o schema **public**:
  - Tabelas/seqs: `sync_settings`, `sync_jobs`, `sync_logs`, `tiny_orders`, `tiny_pedido_itens`, `tiny_produtos`, `tiny_tokens` e suas sequences.
  - Constraints e índices (PK/UNIQUE/FK, índices de data/canal/situação/uf/frete, full-text em produtos).
  - Funções essenciais: `set_updated_at`, `update_tiny_produtos_updated_at`, `tiny_orders_auto_sync_itens` (pg_net → /api/tiny/sync/itens), `orders_metrics`.
  - Triggers: updated_at para tabelas, auto-sync de itens após insert em `tiny_orders`.
  - Segurança: RLS ON em todas as tabelas public, policy `service_role_full_access`, revogações de anon/auth e grants para `service_role`.
- Situação atual:
  - Aplica limpa localmente com `supabase db reset`.
  - Marcada como `applied` no projeto remoto via `supabase migration repair --linked --status applied 20251126000000`. O remoto não foi resetado; é apenas histórico.

## Fluxo correto para novas mudanças de schema
1) Criar a migration:
   ```bash
   supabase migration new minha_mudanca
   ```
   Editar o SQL gerado em `supabase/migrations/<timestamp>_minha_mudanca.sql`.

2) Desenvolver a mudança:
   - Sempre incremental em relação à baseline v2.
   - Não editar a baseline antiga; toda alteração vira nova migration.
   - Não tocar em schemas internos do Supabase (auth/storage/realtime).

3) Testar localmente (sem --linked):
   ```bash
   supabase stop --all
   supabase start
   supabase db reset
   ```
   - Isso aplica seed padrão + baseline v2 + suas novas migrations.
   - Corrija qualquer erro de DDL/FK/PK/trigger antes de seguir.

4) Aplicar no remoto (quando estiver ok):
   ```bash
   supabase db push --linked
   ```
   - Revisar o SQL antes de rodar.

5) Regras de segurança:
   - Nunca rodar `supabase db reset --linked` em produção.
   - Sempre revisar e versionar as migrations no Git antes de `db push --linked`.
   - Manter mudanças somente no schema public; auth/storage/realtime são do seed.

## Uso opcional do diff
- Se fizer ajustes manuais no banco local e quiser gerar migration:
  ```bash
  supabase db diff --linked --schema public
  ```
  - Use o diff como base para uma migration nova (não altere a baseline).

## Resumo
- Baseline v2 é o ponto zero da linha nova e já está aplicada (histórico) no remoto.
- Toda mudança futura: criar migration → testar local (`stop/start/db reset`) → aplicar remoto com `db push --linked`.
- Nunca alterar baseline; sempre migrations novas e revisionadas.
