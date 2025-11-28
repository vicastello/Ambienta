This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Produção – Supabase pg_cron
- **Função**: `public.cron_run_tiny_sync()` (definida em `supabase/migrations/20251128120000_cron_run_tiny_sync.sql`) chama `POST https://gestor-tiny.vercel.app/api/admin/cron/run-sync` usando `net.http_post` e registra logs em `sync_logs`.
- **Job**: `cron.schedule('tiny_sync_every_15min', '*/15 * * * *', $$select public.cron_run_tiny_sync();$$)` mantém o pipeline Tiny → Ambienta atualizado (pedidos recentes, enrich background e sync incremental de produtos) sem depender do Vercel Cron.
- **Frequência**: altere a periodicidade executando `cron.unschedule('tiny_sync_every_15min')` seguido de um novo `cron.schedule(...)` ou ajustando a migration incremental.
- **Vercel Cron (opcional)**: pode ser mantido apenas para tarefas diárias (ex.: refresh de token). O plano grátis da Vercel não precisa mais acionar `/api/admin/cron/run-sync`.
- **UI manual**: os botões em Configurações continuam válidos para disparos sob demanda; eles coexistem com o job automático do Supabase.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
