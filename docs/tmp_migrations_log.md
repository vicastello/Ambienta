# Migração supabase/migrations/20251206120000_drop_sync_produtos_from_tiny.sql

Registro 2025-12-08 07:08:27 -03: `supabase db push --linked --include-all` executado sem erro. Executar manualmente no Supabase Studio para confirmar remoção do job e da função legacy:

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

Registro 2025-12-08 07:50:31 -03: `supabase db push --linked --include-all` executado sem erro. Executar manualmente no Supabase Studio para confirmar remoção do job e da função legacy:

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

Registro 2025-12-08 10:53:52 -03: `supabase db push --linked --include-all` executado sem erro. Executar manualmente no Supabase Studio para confirmar remoção do job e da função legacy:

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

Registro 2025-12-08 14:16:18 -03: `supabase db push --linked --include-all` executado sem erro. Executar manualmente no Supabase Studio para confirmar remoção do job e da função legacy:

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

Registro 2025-12-08 13:39:00 -03: `supabase db push --linked --include-all` executado sem erro. Executar manualmente no Supabase Studio para confirmar remoção do job e da função legacy:

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

Registro 2025-12-08 12:28:47 -03: `supabase db push --linked --include-all` executado sem erro. Executar manualmente no Supabase Studio para confirmar remoção do job e da função legacy:

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

Registro 2025-12-08 11:55:52 -03: `supabase db push --linked --include-all` executado sem erro. Executar manualmente no Supabase Studio para confirmar remoção do job e da função legacy:

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

Registro 2025-12-08 08:35:12 -03: `supabase db push --linked --include-all` executado sem erro. Executar manualmente no Supabase Studio para confirmar remoção do job e da função legacy:

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

Registro 2025-12-08 09:48:23 -03: `supabase db push --linked --include-all` executado sem erro. Executar manualmente no Supabase Studio para confirmar remoção do job e da função legacy:

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

Registro 2025-12-08 11:26:16 -03: `supabase db push --linked --include-all` executado sem erro. Executar manualmente no Supabase Studio para confirmar remoção do job e da função legacy:

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
