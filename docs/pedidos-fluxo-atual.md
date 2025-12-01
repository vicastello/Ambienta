# Pedidos – Fluxo Atual (Tiny ERP → Supabase → App)

## Visão geral
- Pedidos são sincronizados do Tiny via `POST /api/tiny/pedidos` ou cron `run-sync`.
- Itens são gravados em `tiny_pedido_itens`; catálogo em `tiny_produtos`.
- UI /dashboard e /pedidos consomem `tiny_orders`, `tiny_pedido_itens`, `tiny_produtos` via APIs internas (`/api/orders`, `/api/tiny/dashboard/resumo` etc.).

## Garantia de produto nos itens
- `lib/pedidoItensHelper.ts` agora garante que o produto exista antes de inserir itens:
  - Coleta `id_produto_tiny` do detalhe (ou fallback do `raw`).
  - Se o produto não existe em `tiny_produtos`, chama Tiny (`obterProduto` + `obterEstoqueProduto`) e faz `upsertProduto`.
  - Só então grava os itens; se ainda assim não existir, zera o FK para não quebrar, mas em condições normais o produto é criado primeiro.

## Endpoints admin úteis
- `/api/admin/pedidos/retry-itens`: reprocessa pedidos sem itens ou sem código/id (aceita `since`, `limit` ou `tinyIds`).
- `/api/admin/pedidos/update-produtos`: dado um conjunto de pedidos, extrai ids de produtos (itens + raw) e atualiza catálogo + estoque com retry/backoff 429/401.
- `/api/admin/produtos/fetch-by-ids`: wrapper HTTP do script para buscar produtos específicos no Tiny (detalhe + estoque) com retries.

## Rotina recomendada para pedidos recentes
1) Rodar `update-produtos` para a janela (ex.: `{"since":"YYYY-MM-DD","limitPedidos":80}`) para garantir catálogo/estoque/imagem.
2) Rodar `retry-itens` na mesma janela (`force:true`) para regravar itens agora que o catálogo está ok.
3) Para casos pontuais, usar `fetch-by-ids` com a lista de `id_produto_tiny` faltantes.

## Rate limit Tiny
- Requisições aplicam backoff em 429; os endpoints admin aceitam `retries429` para controlar a agressividade.
- Em scripts, usar `BATCH`/`DELAY` menores se o Tiny estiver devolvendo 429 com frequência.

## UI
- /pedidos segue o mesmo visual glass/gradient da dashboard (cards, asides, tabela e mobile cards).
- Endpoints usam `staleWhileRevalidate` para aliviar carga; evitar `cache: 'no-store'` se já houver cache compartilhado.
