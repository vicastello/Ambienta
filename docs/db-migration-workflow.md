# Guia de Migrations (Baseline v2 – schema public)

Contexto:
- Baseline v2: `supabase/migrations/20251126000000_v2_public_baseline.sql` (apenas schema public).
- Stack local validado com `supabase db reset`.
- Histórico remoto já marcado com essa baseline via `supabase migration repair --linked --status applied 20251126000000`.

## Fluxo recomendado para novas migrations
1) Criar o esqueleto:
   ```bash
   supabase migration new minha_mudanca
   ```
   Isso gera um arquivo em `supabase/migrations/<timestamp>_minha_mudanca.sql`.

2) Editar a migration:
   - Parta da baseline v2 como estado atual do schema public.
   - Adicione apenas alterações incrementais (CREATE/ALTER) necessárias.
   - Não mexa em schemas `auth/storage/realtime` (mantidos pelo seed do CLI).

3) Testar localmente (sem --linked):
   ```bash
   supabase stop --all
   supabase start
   supabase db reset
   ```
   - Isso recria o banco local, aplica seed padrão e, em seguida, todas as migrations (baseline + novas).
   - Verifique se não há erros de “relation does not exist” ou conflitos de PK/FK/unique.

4) Validar:
   - Conferir schema e funções criadas/alteradas.
   - Se relevante, rodar consultas simples ou scripts locais para testar a mudança.

5) Aplicar no remoto (quando seguro):
   ```bash
   supabase db push --linked
   ```
   - Requer que o projeto já esteja linkado (`supabase link --project-ref ...`).
   - Nunca use `db reset --linked` (destrutivo).

6) Regras de segurança e boas práticas:
   - Não rodar `supabase db reset --linked` em produção.
   - Não alterar diretamente objetos de `auth/storage/realtime` via migrations custom; limite-se ao schema public.
   - Sempre versionar as migrations no Git antes de aplicar no remoto.
   - Se houver RLS/policies, valide se as novas tabelas ou colunas estão cobertas.

## Checklist rápido
- [ ] Migration criada (`supabase migration new ...`).
- [ ] SQL editado com mudanças incrementais (baseline v2 como base).
- [ ] Teste local: `supabase stop --all && supabase start && supabase db reset`.
- [ ] Sem erros de DDL/PK/FK/índices/triggers.
- [ ] Commit da migration no Git.
- [ ] Aplicação no remoto: `supabase db push --linked` (somente após validação).
