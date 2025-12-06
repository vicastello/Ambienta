# Migração supabase/migrations/20251206120000_drop_sync_produtos_from_tiny.sql

> push concluído com sucesso. Executar estas consultas manualmente no Supabase Studio para confirmar remoção do job + função em cron/rotina:

```sql
-- Verifica se ainda existe job cron chamando a função
select jobid, jobname, schedule, command, active
from cron.job
where command ilike '%sync_produtos_from_tiny%';

-- Verifica se a função legacy ainda existe
select routine_name
from information_schema.routines
where specific_schema = 'public'
  and routine_name ilike '%sync_produtos_from_tiny%';
```
