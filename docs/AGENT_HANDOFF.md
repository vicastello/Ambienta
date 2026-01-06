# Gestor Tiny – Handoff Completo para Novo Agente

Este documento é um guia único e acionável para assumir manutenção/evolução do projeto Gestor Tiny, com foco nos módulos Operacionais (Dashboard, Pedidos, Produtos) e no módulo de Compras (sugestão de compras, histórico, PDF, rascunho, agrupamento por fornecedor).


1) Visão Geral e Stack
- Frontend: Next.js 16 (App Router) + React 19 + Tailwind CSS v4.
- Backend: rotas API em app/api/* (Next.js Route Handlers). Integração com Supabase (Postgres + pg_cron). Integração com Tiny ERP.
- Deploy: Hostinger (Node.js standalone). Supabase como banco/funções/cron.
- Filosofia: o cliente (browser) fala apenas com as nossas APIs internas; a API fala com o banco (supabase-admin) e integrações.

Pastas principais
- app/: rotas, componentes client-heavy, páginas do App Router.
- components/: componentes compartilhados.
- lib/: integrações, utilitários, cache helpers, Tiny/Supabase clients.
- scripts/: tarefas operacionais (sync, backfills, cron local).
- supabase/ e migrations/: schema, functions e jobs de cron.
- docs/: documentação complementar (este arquivo e guias).

Documentos úteis já existentes
- README.md: visão ampla do projeto, pipeline de sync e instruções de execução.
- SUPABASE_CRON_GUIDE.md, SINCRONIZACAO.md, SYNC_*: detalhes de sincronização e manutenção de cron jobs.
- DEV_CRON_SERVER.md, LOCAL_MODE.md: como rodar cron/sync em ambiente local.


2) Setup Rápido para Desenvolvimento
Pré-requisitos
- Node 20+ (nvm recomendado)
- Acesso a um projeto Supabase (URL/keys) e credenciais do Tiny ERP

Passos
1. npm install
2. Copie variáveis: cp env.example .env.local e preencha.
3. Rodar local:
   - App: npm run dev
   - Cron local (opcional): npm run dev:cron
   - Ambos (concurrently): npm run dev:full
4. Qualidade: npm run lint, npm run build, npm test

Variáveis de ambiente mínimas
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- TINY_CLIENT_ID, TINY_CLIENT_SECRET, TINY_REDIRECT_URI
- CRON_SECRET (para endpoints protegidos de cron/admin)

Variáveis opcionais
- TINY_TOKEN_URL, PROCESS_IN_APP, PROCESS_BATCH_DAYS
- FRETE_ENRICH_MAX_PASSES, ENABLE_INLINE_FRETE_ENRICHMENT
- CHANNEL_NORMALIZE_MAX_PASSES, CHANNEL_NORMALIZE_BATCH
- GOOGLE_GEMINI_API_KEY (ou GEMINI_API_KEY), GEMINI_API_BASE_URL, GEMINI_API_VERSION

Comandos úteis
- npm run dev: app local (Next.js)
- npm run dev:cron: cron local via tsx + dotenv
- npm run dev:full: app + cron juntos
- npm run build / npm start: build/produção local
- npm run sync:month: sincroniza janela de pedidos Tiny para Supabase


3) Arquitetura – Fluxo de Dados
Tiny → (APIs internas/scripts) → Supabase (fonte de verdade) → APIs internas → Frontend
- Rate limit do Tiny é respeitado (backoff em 429).
- Produtos/estoque: crons de catálogo e round‑robin de estoque. 
- Pedidos: pipeline com enrich de frete, normalização de canais, garantia de itens com produtos.


4) Módulo de Compras (Sugestão de Compras)
Arquivos‑chave
- app/compras/page.tsx: shell de rota. Import dinâmico com ssr:false para UX consistente no client.
- app/compras/ComprasClient.tsx: componente principal (≈2k linhas). Contém:
  - Estado global: filtros, seleção, overrides, rascunho, histórico, ordenação, estoque live.
  - Cálculo de curva ABC (global) e derivação de métricas por item.
  - Seleção inteligente e snapshots (mantém intenção do usuário entre recálculos).
  - PDF (jspdf + jspdf‑autotable), agrupamento por fornecedor, tabs (pedido/histórico/fornecedor).
  - Rascunho com auto‑save (servidor) e restauração.
- app/compras/components/*: tabela virtualizada, alertas, sticky bar, agrupamento por fornecedor, datepicker etc.
- app/api/compras/*: endpoints usados pelo módulo.
- src/types/compras.ts: contratos SavedOrder, SavedOrderProduct, SavedOrderManualItem.

Estado e chaves de storage
- COMPRAS_DRAFT_KEY (servidor): rascunho em /api/compras/draft (preferimos server a localStorage para não estourar quota e para multi‑device).
- COMPRAS_SAVED_ORDERS_KEY (localStorage cache): cache dos pedidos salvos (sincroniza com /api/compras/pedidos ao montar).
- compras_pending_orders_v1 (localStorage): seleção de pedidos pendentes que contam como “estoque a receber” na sugestão.

Cálculos e Regras principais
- Curva ABC: calculada globalmente pelo valor mensal (consumo_mensal * preço_custo) e guardada em memória (A ≤80%, B ≤95%, resto C).
- Sugerir compra: 
  - consumoDiario = consumo_mensal / 30
  - lead_time_dias = do produto (quando null/undefined, usa DEFAULT_LEAD_TIME=5)
  - cobertura alvo = targetDays + lead_time_dias (para garantir estoque até o pedido chegar)
  - estoqueAtual = saldo − reservado; estoquePendente = soma dos produtos nos pedidos salvos selecionados (aba histórico)
  - quantidadeNecessaria = max(0, consumoDiario * cobertura alvo − estoqueAtual − estoquePendente)
  - embalagem_qtd (pack) ≥ 1; sugestão = ceil(quantidadeNecessaria/pack)*pack
- Seleção inteligente: ao recarregar sugestões (mudança de período/filtros), a tela:
  - calcula auto‑seleção padrão (sugestão>0),
  - aplica diferenças do usuário usando snapshot anterior (itens que o usuário marcou/desmarcou manualmente permanecem com a intenção preservada).
- Rascunho: auto‑save a cada ~2s para /api/compras/draft com: pedidoOverrides, manualItems, currentOrderName, selectedIds, periodDays, targetDays.
- PDF: exporta itens selecionados (produtos + itens manuais) com cabeçalho Ambienta e tabela (cód forn, EAN, nome, qtd, observações).

Ordenação, filtros e visualizações
- Multi‑sort (incremental e com prioridade): sortConfig = [{key, direction}, ...].
- Filtros: busca multi‑termo (nome, SKU, GTIN), fornecedor, classe ABC.
- View modes: all / selected / unselected.
- Alertas: painéis rápidos (críticos A/ruptura ≤7d; ruptura iminente ≤3d; alerta de embalagem).
- Agrupado por fornecedor: aba “Por Fornecedor” replica seleção e lista itens agrupados, facilitando cotação/negociação.

UX & acessibilidade
- Tabela virtualizada (tanstack/react‑virtual) para performance.
- Linhas sticky com fundo opaco para evitar flicker ao scroll.
- Badges de ABC, dias para ruptura, indicadores de sync (saving/saved/error).
- Botão de “Sel. c/ ped.” para selecionar apenas os itens com sugestão > 0.


5) Endpoints (Módulo Compras)
Base: todas as rotas em app/api/compras/* (Next.js route handlers).

GET /api/compras/sugestoes?periodDays=60&targetMonths=2
- Entrada: periodDays (dias de histórico) e targetMonths (cobertura alvo em meses para cálculo base).
- Saída: { periodDays, targetMonths, produtos: Array<{ id_produto_tiny, codigo, nome, gtin, imagem_url, fornecedor_nome/codigo, embalagem_qtd, saldo/reservado/disponivel, consumo_periodo, consumo_mensal, sugestao_base, sugestao_ajustada, alerta_embalagem, observacao_compras, categoria, preco_custo }> }
- Observação: a UI converte targetDays → targetMonths e aplica lead time e estoque pendente no client (ver ComprasClient.tsx → derivados).

PATCH /api/compras/produto
- Entrada: { id_produto_tiny, fornecedor_codigo?: string|null, embalagem_qtd?: number|null, observacao_compras?: string|null, lead_time_dias?: number|null }
- Efeito: atualiza campos manuais do produto (salvo via tinyProdutosRepository). Debounced no client.

GET/PUT/DELETE /api/compras/draft
- GET: retorna rascunho ativo.
- PUT: upsert do rascunho (payload descrito acima).
- DELETE: apaga rascunho ativo (ex.: ao iniciar “Novo Pedido”).

GET/POST /api/compras/pedidos
- GET: lista pedidos salvos.
- POST: cria novo pedido salvo. Payload:
  {
    name, periodDays, targetDays,
    produtos: Array<{ id_produto_tiny, nome?, codigo?, fornecedor_nome?, fornecedor_codigo?, gtin?, quantidade, observacao? }>,
    manualItems: Array<{ id (negativo apenas para rascunho), nome, fornecedor_codigo, quantidade, observacao }>
  }
- Validações: nome obrigatório; precisa ter ao menos 1 item; quantities > 0.

PATCH/DELETE /api/compras/pedidos/:id
- PATCH: renomeia pedido salvo.
- DELETE: remove pedido salvo.


6) Tipos (src/types/compras.ts)
- SavedOrder, SavedOrderProduct, SavedOrderManualItem
- O cliente usa uma normalização local (normalizeSavedOrderRecord) para defaults e consistência.


7) Convenções e Boas Práticas
- SSR: para telas client‑heavy (compras, produtos, pedidos, dashboard), use dynamic(..., { ssr:false }) quando houver muito estado do lado do cliente para evitar flicker/hidratação instável.
- Debounces: respeite COMPRAS_RECALC_DEBOUNCE_MS e AUTO_SAVE_DEBOUNCE_MS ao alterar entradas numéricas e campos manuais.
- Rate limit Tiny: qualquer endpoint/script que converse com o Tiny deve tolerar 429 com retry/backoff e logs (veja lib/tinyApi.ts e scripts/ relacionados).
- LocalStorage: use com parcimônia (há quotas por domínio). Dados volumosos de rascunho devem ir ao servidor (/api/compras/draft).
- Acessibilidade: botões com role e aria‑labels nos toggles/checkbox e cabeçalhos ordenáveis expõem aria‑sort.


8) Como Estender o Módulo de Compras
- CSV além do PDF: reutilize buildSelectionSnapshot, gere rows e use papaparse/xlsx.
- Regras de compra por fornecedor: introduza um dicionário de mínimos por fornecedor (ex.: pedido mínimo em reais/unidades) e valide ao salvar/exportar.
- Cenários de orçamento: salve múltiplos rascunhos com chaves diferentes (ex.: currentDraftKey) e permita “duplicar rascunho”.
- Colaborador: permitir comentar por item (nova coluna anotação interna não exportada ao PDF).
- Integração pedido → Tiny: criar endpoint /api/compras/export/tiny para enviar o pedido salvo como “pedido de compra” no Tiny (requer mapear fornecedores/códigos).


9) Debug Rápido
- Problema de “parece incompleto”: confirmar que page usa dynamic(..., { ssr:false }) e que o skeleton está adequado.
- Sugestão não bate: ver lead_time_dias (padrão 5), estoquePendente (seleção na aba histórico) e embalagem_qtd.
- Auto‑save não dispara: ver console para conflitos de debounces; verificar /api/compras/produto e /api/compras/draft.
- 429 do Tiny: aguardar backoff; conferir logs no terminal/console e ajustar delays se estiver rodando scripts.


10) Segurança e Segredos
- Nunca exponha SERVICE_ROLE_KEY no cliente. Rotas internas no servidor usam essa key via process.env.
- Endpoints /api/admin/* e crons exigem CRON_SECRET (Bearer/Cabecalho) – veja SUPABASE_CRON_GUIDE.md.


11) Referências Rápidas
- app/compras/ComprasClient.tsx (núcleo da tela)
- app/compras/components/ProductTable.tsx (tabela virtualizada)
- app/api/compras/* (sugestões, produto, rascunho, pedidos)
- src/types/compras.ts (contratos)
- README.md (visão do projeto + pipeline)

Dúvidas comuns podem ser resolvidas lendo o README e os arquivos em docs/. Este handoff prioriza o módulo de Compras; o restante do app segue a mesma filosofia (App Router + APIs internas + Supabase) e está documentado nos guias existentes.
