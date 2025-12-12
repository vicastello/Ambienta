# Log de mudanças (Codex)

Registro rápido de alterações feitas pelo agente. Atualize sempre que fizer modificações relevantes.

## 2025-12-15
- Relatório de vendas passa a usar o marketplace como fonte de verdade para kits; inferência pelo Tiny só ocorre quando não há itens do marketplace.
- Deduplicação de itens do Meli no relatório e criação de scripts de suporte (`report-kit-vs-unit`, `cleanup-meli-items`, `meli-link-pack-orders`, `meli-backfill-missing-items`).
- Migration criada para evitar itens duplicados no Tiny: `supabase/migrations/20251215183000_tiny_pedido_itens_unique_constraint.sql` (NOT NULL + UNIQUE em `id_pedido,codigo_produto,valor_unitario,valor_total`).
- Cleanup rodado em `meli_order_items` para remover 6 duplicatas.
