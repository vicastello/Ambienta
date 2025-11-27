## Roteiro de testes de estoque

### 1) Verificar sync Tiny → tiny_produtos
1. Rode um sync de produtos (local ou remoto, conforme ambiente):  
   - Via API: `POST /api/produtos/sync` com body `{ "limit": 100, "enrichEstoque": true }`.  
   - Ou script: `node scripts/jobSyncProdutos.js` (ajustar env/keys).  
2. No SQL (local): `select id_produto_tiny, saldo, reservado, disponivel, updated_at from tiny_produtos order by updated_at desc limit 5;`  
3. Esperado: valores preenchidos/atualizados e `updated_at` recente.

### 2) Simular venda/pedido recente
1. Rode um sync de pedidos (`POST /api/tiny/sync` com `mode: "recent"`).  
2. Após o job, rode novamente `/api/produtos/sync` (ou script) para atualizar estoque dos SKUs tocados.  
3. Confirme no SQL que `saldo/disponivel` mudaram para os SKUs do pedido.

### 3) Checar UI sem F5 (polling)
1. Abra `/produtos` e observe estoques.  
2. Dispare `/api/produtos/sync` em outra aba.  
3. Em até ~30s, a página deve revalidar e refletir o novo estoque (sem F5).  
4. Repita em `/dashboard`: aguarde até 60s para ver métricas/estoque de top produtos atualizados.

### 4) Realtime (opcional/futuro)
- Se habilitar Realtime no Supabase (publication + policy), assine `tiny_produtos` no front e valide que updates aparecem imediatamente sem polling.
