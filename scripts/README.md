# scripts/syncMonth

Script `scripts/syncMonth.ts` — roda uma sincronização de pedidos do Tiny para um intervalo de datas
e faz upsert dos pedidos na tabela `tiny_orders` do Supabase usando a `SUPABASE_SERVICE_ROLE_KEY`.

Requisitos de ambiente (defina no seu servidor ou localmente):

- `NEXT_PUBLIC_SUPABASE_URL` (ex: `https://xyz.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` (service role key do Supabase)
- `TINY_CLIENT_ID` (OAuth client id do Tiny)
- `TINY_CLIENT_SECRET` (OAuth client secret do Tiny)
- (opcional) `TINY_TOKEN_URL` se você tiver um URL customizado

Como rodar localmente (exemplo):

```bash
# instalar deps (se ainda não instalou)
npm install

# rodar o script (usando ts-node via npm script adicionado)
npm run sync:month -- --start=2025-11-01 --end=2025-11-30
```

Observações:

- O script usa a função `getAccessTokenFromDbOrRefresh()` presente em `lib/tinyAuth.ts` — portanto
  é necessário que exista uma linha em `tiny_tokens` com um `refresh_token` (gerada quando você
  conectou o Tiny via OAuth no app) para que o token seja renovado automaticamente.
- O script grava um `sync_jobs` com `status` e `sync_logs` em caso de erro para que você consiga
  auditar a execução no banco.
- Para agendar: adicione uma entrada cron no servidor que rode o comando acima (ex.: `0 3 * * *`
  para rodar diariamente às 03:00). Exemplo de linha crontab:

```cron
# roda o sync do mês corrente no dia 1 às 03:00
0 3 1 * * cd /path/to/repo && /usr/bin/npm run sync:month -- --start=$(date +"%Y-%m-01") --end=$(date +"%Y-%m-%d") >> /var/log/syncMonth.log 2>&1
```

Se quiser, eu posso também criar uma versão JS (sem TypeScript) que não dependa do `ts-node`,
ou adaptar o script para rodar como um AWS Lambda / Cloud Run job.
