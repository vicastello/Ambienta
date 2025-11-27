## Cron de estoque/produtos (Supabase → Vercel)

### Fluxo
- Supabase Edge Function `cron-sync-produtos` roda a cada 5–10 minutos (scheduler do Supabase).
- A função chama `https://gestor-tiny-g9a8gkbpw-vihcastello-6133s-projects.vercel.app/api/produtos/sync` enviando o header `X-AMBIENTA-SYNC-TOKEN`.
- A rota `/api/produtos/sync` executa o helper compartilhado `syncProdutosFromTiny`, atualizando `public.tiny_produtos`.
- A UI no Vercel faz polling (30s em `/produtos`, 60s em `/dashboard`) e exibe estoque quase em tempo real.

### Variáveis de ambiente (mesmo segredo nos dois lados)
- Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
  - `TINY_API_BASE_URL`, `TINY_CLIENT_ID`, `TINY_CLIENT_SECRET`, `TINY_REDIRECT_URI`
  - `GEMINI_API_KEY`
  - `SYNC_PRODUTOS_SECRET` — token forte para header `X-AMBIENTA-SYNC-TOKEN` (rota `/api/produtos/sync`).
- Supabase (projeto Ambienta):
  - `SYNC_PRODUTOS_SECRET` — **mesmo valor** usado no Vercel.
  - `VERCEL_API_BASE_URL` — URL pública do app: `https://gestor-tiny-g9a8gkbpw-vihcastello-6133s-projects.vercel.app`.
- Arquivos de exemplo:
  - `.env.vercel.example` (Vercel)
  - `supabase/.env.example` (Supabase)

### Edge Function
- Arquivo: `supabase/functions/cron-sync-produtos/index.ts`
- Comportamento: faz `fetch` POST para `/api/produtos/sync` com `limit: 100`, `enrichEstoque: true`, header `X-AMBIENTA-SYNC-TOKEN`.
- Resposta: 200 quando sucesso, 500 com mensagem em caso de erro/timeout.

### Proteção da rota
- `/api/produtos/sync` só roda se o header `X-AMBIENTA-SYNC-TOKEN` corresponder a `process.env.SYNC_PRODUTOS_SECRET`.
- Sem token ou token errado: 401.
- **Não** commitar o valor do token; configurar no painel (Vercel e Supabase). Token deve ser forte e idêntico nos dois.

### Como configurar o cron no Supabase (passo a passo)
1. Acesse o projeto correto (Ambienta Project) no painel do Supabase.
2. Vá em Edge Functions e encontre `cron-sync-produtos`.
3. Abra a aba de Schedules (Scheduled Functions).
4. Crie um schedule:
   - Nome: `cron-sync-produtos-10min`
   - Frequência: a cada 10 minutos (se cron, usar `*/10 * * * *`)
   - Método: POST (padrão).
5. Salve. Para pausar, desabilite ou remova o schedule nessa mesma tela.

### Testes manuais (fim a fim)
- Rota Vercel:
  ```bash
  curl -X POST https://gestor-tiny-g9a8gkbpw-vihcastello-6133s-projects.vercel.app/api/produtos/sync \
    -H "Content-Type: application/json" \
    -H "X-AMBIENTA-SYNC-TOKEN: $SYNC_PRODUTOS_SECRET" \
    -d '{"limit":50,"enrichEstoque":true}'
  ```
  Esperado: 200 OK; `tiny_produtos` com `updated_at` recente no Supabase.

- Função Supabase local:
  ```bash
  # Em outra aba: supabase functions serve cron-sync-produtos
  curl -X POST http://localhost:54321/functions/v1/cron-sync-produtos
  ```
  Requer `VERCEL_API_BASE_URL` e `SYNC_PRODUTOS_SECRET` configurados no ambiente local do Supabase CLI.

- Teste com UI aberta:
  1) Abra `/produtos` e `/dashboard`.  
  2) Rode o curl para `/api/produtos/sync`.  
  3) Em ~30–60s o polling deve refletir o estoque/insights atualizados sem F5.

- Teste do cron real (após criar o schedule):
  1) Aguarde 10–20 minutos.  
  2) Veja logs da função `cron-sync-produtos` no painel (status 200).  
  3) Confirme `tiny_produtos` atualizado mesmo sem rodar manualmente.

### Checklist de configuração
- Vercel (Production):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DATABASE_URL`
  - `TINY_API_BASE_URL`
  - `TINY_CLIENT_ID`
  - `TINY_CLIENT_SECRET`
  - `TINY_REDIRECT_URI`
  - `GEMINI_API_KEY`
  - `SYNC_PRODUTOS_SECRET` (token forte; usado no header `X-AMBIENTA-SYNC-TOKEN`)

- Supabase (Project env vars):
  - `VERCEL_API_BASE_URL` = `https://gestor-tiny-g9a8gkbpw-vihcastello-6133s-projects.vercel.app`
  - `SYNC_PRODUTOS_SECRET` = mesmo valor do Vercel
