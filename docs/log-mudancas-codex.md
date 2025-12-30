# Log de mudanças (Codex)

Registro rápido de alterações feitas pelo agente. Atualize sempre que fizer modificações relevantes.

## 2025-12-28 (Integração de IA - Fase 1 & 2)
- **Migração para Groq**: Substituída API do Gemini para Groq (Llama 3.3 70B), zerando custos e melhorando performance.
- **Copilot Chat**: 
  - Criado componente `CopilotChat.tsx` com histórico local e integração com Supabase.
  - Implementada rota `/api/ai/chat` com detecção automática de intent ("Deep Analysis").
  - Criada classe `AIDataProvider` para acesso direto a `tiny_orders`, `tiny_produtos` e `cash_flow_entries`.
  - Corrigido erro de colunas (`estoque_minimo` -> estático) permitindo análise profunda mesmo em falhas.
  - Adicionado fallback resiliente: Chat funciona sem tabelas de histórico ou em caso de erro 500.
- **Persistência**: Criada documentação `MIGRATION_GUIDE.md` com SQL para tabelas `ai_conversations` e `ai_messages` (execução manual requerida).
- **Widgets Inteligentes**: 
  - `ProactiveInsightsBanner.tsx`: Alertas de anomalias (queda vendas, concentração canal).
  - `ExecutiveSummaryWidget.tsx`: Resumo diário gerado por IA.

## 2025-12-29 (IA configurável + ações)
- **Configurações de IA**:
  - Nova aba em `/configuracoes` com seleção de provedor, parâmetros globais e permissões de ações.
  - Persistência em `sync_settings.settings.ai` via `/api/configuracoes/ai`.
- **Multi-provedor**: rotas `/api/ai/*` agora leem o provedor ativo e usam o client OpenAI-compatível.
- **Ações em chat**: suporte a tags `[ACTION]` para disparar syncs e ajustar filtros/canais no dashboard.

## 2025-12-29 (Nerve Center 2.0 - GPT-5 nano/mini)
- **Modelos duplos**: quick (GPT‑5 nano) e deep (GPT‑5 mini) configuráveis por provedor.
- **Sidebar global**: IA flutuante e colapsável integrada ao `AppLayout`, com offset da borda e ajuste de layout.
- **Contexto por tela**: endpoint `/api/ai/context` com summaries de produtos/pedidos/financeiro (Supabase).
- **Streaming**: chat com streaming SSE e execução de ações via `/api/ai/actions`, com logs em `ai_action_logs`.

## 2025-12-15
- Relatório de vendas passa a usar o marketplace como fonte de verdade para kits; inferência pelo Tiny só ocorre quando não há itens do marketplace.
- Deduplicação de itens do Meli no relatório e criação de scripts de suporte (`report-kit-vs-unit`, `cleanup-meli-items`, `meli-link-pack-orders`, `meli-backfill-missing-items`).
- Migration criada para evitar itens duplicados no Tiny: `supabase/migrations/20251215183000_tiny_pedido_itens_unique_constraint.sql` (NOT NULL + UNIQUE em `id_pedido,codigo_produto,valor_unitario,valor_total`).
- Cleanup rodado em `meli_order_items` para remover 6 duplicatas.
- Produtos: adicionado multiplicador (quantidade) ao vincular embalagens na UI de produtos; POST envia `quantidade` para `produto_embalagens` (permitindo 1x, 2x, etc.).
