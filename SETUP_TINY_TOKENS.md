# ⚠️ Setup Manual Necessário - Tabela tiny_tokens Faltando

## Problema

A tabela `tiny_tokens` não foi criada no Supabase. Isso causa a falha ao tentar sincronizar pedidos do Tiny.

## Solução Rápida (2 minutos)

### Opção 1: Via Supabase Dashboard (RECOMENDADO)

1. Acesse: **https://app.supabase.com/project/znoiauhdrujwkfryhwiz/sql**
2. Cole este SQL no editor:

```sql
create extension if not exists pgcrypto;

create table if not exists public.tiny_tokens (
  id integer primary key default 1,
  access_token text,
  refresh_token text,
  expires_at bigint,
  scope text,
  token_type text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into public.tiny_tokens (id) values (1) on conflict (id) do nothing;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tiny_tokens_updated_at on public.tiny_tokens;
create trigger trg_tiny_tokens_updated_at
before update on public.tiny_tokens
for each row
execute function public.set_updated_at();
```

3. Click em **"Run"** (ou RUN com ⌘/Ctrl+Enter)
4. ✅ Pronto!

### Opção 2: Via Supabase CLI

```bash
# 1. Instalar CLI (se não tiver)
brew install supabase/tap/supabase

# 2. Login
supabase login

# 3. Link project
supabase link --project-ref znoiauhdrujwkfryhwiz

# 4. Push migrations
supabase db push
```

---

## Próximos Passos

1. **Após criar a tabela**, faça login em: **http://localhost:3000/login**
2. Clique em **"Conectar com Tiny"**
3. Você será redirecionado para autenticar com Tiny
4. Após autenticar, um `refresh_token` será salvo em `tiny_tokens`
5. Agora o sync funcionará!

### Testar Sync

```bash
curl -X POST http://localhost:3000/api/tiny/sync \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "range",
    "dataInicial": "2025-11-01",
    "dataFinal": "2025-11-30",
    "background": false
  }'
```

---

## Solução de Problemas

### "Tabela tiny_tokens ainda não encontrada"

- Verifique que o SQL foi executado **com sucesso** no Supabase
- Cheque em **Database > Tables** que a tabela aparece
- Limpe o cache do Supabase fazendo refresh (Command+Shift+R ou Ctrl+Shift+R)

### "Tiny não está conectado"

- Você não executou o login/autenticação com Tiny
- Acesse **http://localhost:3000/login** e clique em "Conectar com Tiny"
- Isso salvará um `refresh_token` em `tiny_tokens`

### Erro de autenticação ao fazer curl

- Você precisa ter um `access_token` válido em `tiny_tokens`
- Use o login web primeiro: **http://localhost:3000/login**

---

## Referência Técnica

- **Arquivo de migration**: `migrations/001_create_sync_tables_and_tiny_tokens.sql`
- **Código que usa**: `lib/tinyAuth.ts` (função `getAccessTokenFromDbOrRefresh`)
- **Sync processor**: `lib/syncProcessor.ts`

---

## Checklist

- [ ] SQL executado no Supabase Dashboard
- [ ] Tabela `tiny_tokens` criada (verifique em Database > Tables)
- [ ] Autenticação do Tiny feita (http://localhost:3000/login)
- [ ] `sync_logs` mostra "Token salvo com sucesso"
- [ ] Sync de November 2025 retorna 1544 pedidos (esperado)

