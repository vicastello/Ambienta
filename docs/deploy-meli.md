# Deploy Mercado Livre – Produção

## Passo 1: Aplicar migrations no Supabase remoto
```bash
supabase db push --linked
```
> Não usar `supabase db reset --linked` em produção.

## Passo 2: Conferir colunas no Supabase
Verifique na UI do Supabase se as tabelas `public.meli_orders` e `public.meli_order_items` estão com as colunas novas (buyer_full_name, buyer_email, shipping_city, shipping_state em meli_orders).

## Passo 3: Conferir o job do cron
```sql
select * from cron.job where jobname = 'meli_orders_sync_15min';
```

## Passo 4: Garantir envs na Vercel (Mercado Livre)
- `ML_APP_ID`
- `ML_ACCESS_TOKEN`
- `ML_CLIENT_SECRET`
- `ML_REDIRECT_URI`
- `ML_REFRESH_TOKEN` (se estiver usando refresh)

## Passo 5: Deploy do Next (Vercel)
Faça o deploy do projeto na Vercel após as envs estarem corretas.

## Passo 6: Rodar um sync manual em produção (opcional para validar)
```bash
curl -X POST "https://gestao.ambientautilidades.com.br/api/marketplaces/mercado-livre/sync" \
  -H "x-cron-secret: <mesmo-segredo-usado-nos-outros-crons>" \
  -H "Content-Type: application/json" \
  -d '{"periodDays":7,"pageLimit":3,"pageSize":50}'
```

## Passo 7: Validar na UI
Abra `https://gestao.ambientautilidades.com.br/marketplaces/mercado-livre` e confirme:
- pedidos carregando via Supabase (fonte supabase),
- nome completo do cliente,
- Cidade/UF,
- cron rodando a cada 15 min.
