## Proposta v2 para estoque quase em tempo real

### Fonte da verdade
- Continuar usando `public.tiny_produtos` como fonte principal (`saldo`, `reservado`, `disponivel`).
- Valores vêm do Tiny ERP; sincronismo deve ser frequente e previsível.

### Como atualizar estoque
1) **Sync recorrente Tiny → tiny_produtos**  
   - Agendar chamada a `/api/produtos/sync` (ou script `scripts/jobSyncProdutos.ts`) a cada ~5–10 minutos para trazer saldo/reservado/disponivel e imagem.  
   - Quando um job de pedidos (`/api/tiny/sync`) terminar, disparar um sync parcial de produtos (foco nos SKUs afetados) para refletir vendas recentes.
2) **Pedidos locais não alteram estoque diretamente**  
   - Mantemos o Tiny como fonte única; não decrementamos `tiny_produtos` manualmente ao inserir `tiny_orders/tiny_pedido_itens`.  
   - Se quiser abater localmente, criar uma migration nova e uma função dedicada (futuro).

### Como o front recebe mudanças
- **Opção imediata (implementada agora)**: polling periódico nas páginas que mostram estoque (Produtos, Dashboard) para revalidar dados sem F5.  
- **Próximo passo (opcional)**: habilitar Supabase Realtime para `tiny_produtos` no projeto remoto e assinar changes no front. Requer:  
  - Publication do Realtime incluindo `public.tiny_produtos`.  
  - Policy de SELECT compatível com o client que vai assinar (ou usar backend proxy com service_role).

### RLS / segurança
- Manter RLS ON nas tabelas public conforme baseline.  
- As rotas usam `supabaseAdmin` (service_role) para leitura/escrita; não expor service_role no client.  
- Se habilitar Realtime para browser, criar policies de SELECT específicas para o papel usado (ou fornecer um backend proxy).

### Passos práticos
- Agendar execução de `/api/produtos/sync` ou `scripts/jobSyncProdutos.ts` (cron/worker).  
- Manter polling leve nas páginas críticas (30–60s).  
- Opcional: habilitar Realtime no painel Supabase e ajustar policies/publications, depois trocar polling por subscription em `tiny_produtos`.
