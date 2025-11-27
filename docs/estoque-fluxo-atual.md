## Fluxo atual de estoque (estado observado)

### Fonte de dados
- Tabela `public.tiny_produtos` (campos de estoque: `saldo`, `reservado`, `disponivel`; metadados: `id_produto_tiny`, `situacao`, `tipo`, `imagem_url`, etc.).
- Estoque chega do Tiny ERP via API (Tiny `/produtos` + `/estoque/{idProduto}`).

### Quem atualiza
- `app/api/produtos/sync/route.ts` (POST): sincroniza produtos do Tiny, com enriquecimento de estoque (`saldo`, `reservado`, `disponivel`) e imagem. Usa `getTinyAccessToken`, `listarProdutos`, `obterProduto`, `obterEstoqueProduto`, e upsert em `tiny_produtos`.
- Scripts de apoio (executados manualmente/cron):
  - `scripts/jobSyncProdutos.ts` (sincronização de produtos com opção de buscar estoque).
  - `scripts/syncProdutosInitial.ts`, `scripts/updateProdutosEstoqueImagem.ts` (cargas e enriquecimento de estoque/imagem).
- Sync de pedidos:
  - `app/api/tiny/sync/route.ts` cria jobs.
  - `lib/syncProcessor.ts` importa pedidos (`tiny_orders`) e itens (`tiny_pedido_itens`) mas **não** altera estoque em `tiny_produtos`; estoque continua vindo do Tiny via rotas/scripts de produtos.

### UI / consumo
- `app/produtos/page.tsx`: lista produtos/estoque via `/api/produtos` com cache local e botão “Sincronizar” (chama `/api/produtos/sync`). Sem Realtime; dependia de reload manual/cache.
- `app/dashboard/page.tsx`: usa `/api/tiny/dashboard/resumo` (sem Realtime) para cards/insights e exibe estoque básico quando disponível.
- `app/api/tiny/dashboard/resumo/route.ts`: agrega métricas e, para “top produtos”, busca estoque em `tiny_produtos`.

### O que está faltando para “tempo quase real”
- Nenhum listener Realtime para `tiny_produtos`.
- Estoque depende de rodar `/api/produtos/sync` ou scripts/cron; não existe decremento baseado em pedidos locais.
- UI não revalida automaticamente (sem polling/SSE).
