Big Picture

Next.js App Router (TypeScript, Tailwind 4) rodando na Vercel; Supabase Postgres é o sistema de registro; Tiny ERP é o upstream.

Modo agente autônomo (gestor-tiny)
- Pode rodar npm run dev/lint/build/test, npx tsx scripts/*.ts e navegar em todo o repo.
- Para investigar bugs: seguir fluxo completo Tiny/Supabase → API → componente; usar flags de debug (ex.: debugResumo/debugPedidos) e reproduzir local quando possível.
- Validar sempre com npm run lint e npm run build após mudanças.
- Evitar ações destrutivas (reset/drop); se precisar de algo arriscado, pedir confirmação.
- Quando sem acesso a serviços externos/env vars, relatar bloqueio e instruir comandos que o usuário pode rodar.

UI é majoritariamente client-side e envolvida por components/layout/AppLayout.

Tabelas principais (schema public):

tiny_orders (pedido/raw/cidade/uf)

tiny_pedido_itens

tiny_produtos

tiny_tokens (sempre id = 1)

sync_settings, sync_jobs, sync_logs

Schema, pg_cron e pg_net vivem em migrations/ e supabase/migrations/ (ex.: RPC orders_metrics).

Sync & Cron

POST /api/tiny/sync:

Enfileira sync_jobs.

lib/syncProcessor.ts quebra intervalos de datas, chama Tiny via listarPedidosTinyPorPeriodo, faz backoff em 429, upserta via upsertOrdersPreservingEnriched (preserva frete/canal/cidade/uf), e depois roda:

runFreteEnrichment

normalizeMissingOrderChannels

sincronizarItensAutomaticamente

Enriquecimento de frete em background:

Endpoint /api/tiny/sync/enrich-background é chamado por pg_cron (migration 20251122123000_cron_sync_itens_e_imagens.sql) a cada 5 minutos.

Enriquecimento inline é opcional (ENABLE_INLINE_FRETE_ENRICHMENT=false por padrão) para respeitar ~100 req/min do Tiny. 
Ecorn
+1

Sync de itens:

sincronizarItensPorPedidos + trigger trg_tiny_orders_auto_sync_itens (migration 20251122124500_trigger_auto_sync_itens.sql) fazem POST para /api/tiny/sync/itens sempre que um tiny_orders é inserido.

scripts/devCronServer.ts espelha o cron de produção localmente e normaliza canais.

Sync de produtos:

Fluxo oficial via app/api: cron chama `/api/admin/cron/sync-produtos` (pipeline `lib/tinyApi.ts` + cursores em `produtos_sync_cursor`). A função SQL `sync_produtos_from_tiny()` foi aposentada e será removida pelo drop migration.

Cron da Vercel (vercel.json) renova tokens do Tiny diariamente.

Dev helpers npm run dev:cron / ./start-dev-cron.sh simulam os agendamentos.

Tiny Auth

OAuth:

/api/tiny/auth/login → /api/tiny/auth/callback grava cookies e tiny_tokens (sempre id=1).

Sempre obter tokens via getAccessTokenFromDbOrRefresh (requer TINY_CLIENT_ID, TINY_CLIENT_SECRET, TINY_REDIRECT_URI, opcional TINY_TOKEN_URL) e logar falhas em sync_logs.

Superfícies de refresh:

/api/tiny/auth/refresh (GET status / POST refresh).

/api/tiny/auth/save-token para inserção manual.

/api/admin/cron/refresh-tiny-token (com CRON_SECRET opcional) para renovação agendada.

API Surfaces to Reuse

/api/orders:

Usa supabaseAdmin para filtrar/paginar pedidos.

Ordenação restrita a numero_pedido, data_criacao, valor, valor_frete.

Faz join com tiny_pedido_itens + tiny_produtos.imagem_url para contagem de itens e primeira imagem.

Envolve métricas via RPC orders_metrics.

/api/tiny/dashboard/resumo:

Agrega tiny_orders + itens/produtos persistidos (com timezone e fallbacks de dados raw) em:

periodoAtual, periodoAnterior

canais

mapaVendasUF, mapaVendasCidade

topProdutos

situacoesDisponiveis

Consumido por app/dashboard/page.tsx.

/api/produtos:

Lista paginada de tiny_produtos usando service role.

/api/produtos/sync:

Puxa do Tiny (estoque opcional).

/api/ai/insights:

Usa Gemini (GEMINI_API_KEY / GOOGLE_GEMINI_API_KEY, GEMINI_MODEL, GEMINI_API_*).

Instruções gerais para o agente de IA neste projeto (Ambienta + Supabase + Tiny ERP)
Linguagem e estilo

Sempre responda em português (Brasil).

Prefira respostas diretas, com exemplos práticos e código pronto.

Quando sugerir mudanças em arquivos, use caminhos relativos (ex.: src/..., app/api/..., supabase/...).

Visão geral do projeto

Projeto: painel/serviço da Ambienta integrado ao Supabase Postgres e ao Tiny ERP.

Stack principal:

Next.js (App Router) em TypeScript.

Supabase como banco de dados e autenticação.

Tiny ERP para pedidos/produtos/sincronização.

O schema public do Postgres é a fonte de verdade da lógica de negócio (sync de pedidos/produtos, métricas e automações).

Banco de dados e migrations
Estado “verdadeiro” do banco

Considere que o estado atual do public é descrito por:

supabase/migrations/20251126000000_v2_public_baseline.sql (baseline v2 “only public”) — NÃO deve ser alterada.

supabase-export/schema.sql

supabase-export/hardening.sql

Documentação em docs/database-overview.md

Tabelas principais (schema public):

sync_settings, sync_jobs, sync_logs → configuração e rastreio de jobs Tiny.

tiny_orders, tiny_pedido_itens → espelho dos pedidos e itens do Tiny.

tiny_produtos → catálogo de produtos (estoque, preços, fornecedor, embalagem etc.).

tiny_tokens → access/refresh token do Tiny.

Funções importantes:

set_updated_at, update_tiny_produtos_updated_at → triggers de updated_at.

tiny_orders_auto_sync_itens → trigger que chama pg_net em /api/tiny/sync/itens.

orders_metrics → função de métricas agregadas de pedidos (bruto, frete, líquido, contagens por situação etc.).

Migrations v2 (Supabase)

A baseline v2 está em supabase/migrations/20251126000000_v2_public_baseline.sql e não deve ser alterada.

Qualquer mudança de schema deve ser feita criando novas migrations em supabase/migrations/ usando o Supabase CLI.

Fluxo padrão esperado (local):

supabase migration new minha_mudanca

Editar o arquivo gerado em supabase/migrations/....

supabase stop --all

supabase start

supabase db reset (LOCAL, sem --linked) para testar seed + baseline + novas migrations.

Se estiver tudo ok: supabase db push --linked para aplicar no projeto remoto.

Restrições:

Nunca sugerir supabase db reset --linked em produção.

Não alterar schemas internos do Supabase (auth, storage, realtime) via linha v2, a menos que seja pedido explicitamente.

Preferir migrations em vez de SQL solto no painel.

Tipos TypeScript e Supabase client
Tipos do banco

Tipos oficiais em src/types/db-public.ts, contendo:

Json

*Row (ex.: TinyOrdersRow, TinyProdutosRow)

*Insert, *Update

DatabasePublicSchema

Database (com public: DatabasePublicSchema)

Sempre que gerar código que acessa o banco, use esses tipos (não recrie interfaces para as mesmas tabelas).

Clients Supabase

lib/supabaseClient.ts → client público (createClient<Database>(URL, anonKey)).

lib/supabaseAdmin.ts → client administrativo (createClient<Database>(URL, serviceRoleKey)), apenas em código server-side (rotas API, scripts etc.).

Regras:

Nunca expor SUPABASE_SERVICE_ROLE_KEY no client-side.

Use supabaseClient no browser e supabaseAdmin em rotas API / server actions / scripts.

Use sempre os tipos de src/types/db-public.ts.

Exemplo esperado:

import { createClient } from '@supabase/supabase-js';
import type { Database, TinyOrdersRow } from '@/src/types/db-public';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export async function listarPedidosRecentes(): Promise<TinyOrdersRow[]> {
  const { data, error } = await supabase
    .from('tiny_orders')
    .select('*')
    .order('data_criacao', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

Repositórios e camada de acesso a dados

Padrão desejado: repositórios em src/repositories/, por exemplo:

tinyOrdersRepository.ts

tinyProdutosRepository.ts

tinyPedidoItensRepository.ts

syncRepository.ts

Rotas de API em app/api/...:

Devem usar repositórios e NÃO chamar supabase.from(...) diretamente.

Ao criar/refatorar código:

Mover lógica de acesso a dados para os repositórios.

Deixar as rotas de API “finas”: validação + orquestração + resposta HTTP.

MODO DEBUG VISUAL — OBRIGATÓRIO

Sempre que eu pedir para corrigir um bug de frontend ou fluxo de dashboard (Next.js / React), você deve:

1. Subir o servidor de desenvolvimento
   - Verifique se as dependências estão instaladas.
   - Rode `npm install` se necessário.
   - Rode `npm run dev` no terminal do projeto.

2. Abrir a aplicação rodando em dev
   - Use os recursos disponíveis no ambiente para abrir a URL do app em DEV, por exemplo:
     - `http://localhost:3000/`
     - `http://localhost:3000/dashboard`
     - ou qualquer rota que eu especificar.
   - Se existir comando ou ferramenta de “Preview”/“Open in Browser”/“Open Preview” no editor, use-a para abrir a página.

3. Reproduzir o problema
   - Navegue até a tela correta.
   - Observe:
     - erros visuais,
     - erros no console,
     - respostas de API incorretas (status code, payload estranho),
     - discrepância entre números exibidos e o esperado.
   - Use esses sinais como base principal da sua investigação.

4. Só depois mexer no código
   - Localize os arquivos certos (API + componente React).
   - Aplique as mudanças usando “Apply Patch” ou mecanismo equivalente.
   - Mantenha o estilo existente.

5. Validar sempre
   - Com o dev server rodando, atualize a página e confira se:
     - o erro sumiu,
     - os números exibidos batem com o expected (ex.: total de pedidos, faturamento, gráficos).
   - Rode também:
     - `npm run lint`
     - `npm run build`
   - Se algum desses falhar, corrija até passar.

SE NÃO CONSEGUIR ABRIR A PÁGINA
- Se o ambiente NÃO permitir abrir preview/janela do app:
  - Explique claramente que não conseguiu abrir a página.
  - Me diga qual URL eu devo abrir manualmente para ver o mesmo problema.
  - Continue a investigação usando logs, respostas de API e código-fonte.

Segurança e RLS

RLS habilitada em tiny_orders, tiny_pedido_itens, tiny_produtos, tiny_tokens, sync_*.

Policies service_role_full_access liberam acesso total apenas para service_role.

Nunca expor serviceRoleKey no client-side.

Use supabaseAdmin apenas em:

Rotas API (app/api/...).

Scripts/cron servers.

Edge/Server components, nunca diretamente no browser.

Frontend / UI (Ambienta “Liquid Glass”)
Estilo visual geral

Estilo: glassmorphism minimalista, inspirado em iOS/macOS.

Fundos:

Translúcidos com blur, leve “tint” esbranquiçado (10–15%).

Orbs/gradientes sutis no background, sem poluição visual.

Cores:

Cor de destaque: #009DA8 / #009ca6 em detalhes (ícones, badges, bordas, botões discretos).

Evitar blocos chapados com essa cor como fundo principal.

Layout:

Cards bem espaçados, cantos bem arredondados, sombras suaves.

Tipografia limpa, poucos pesos (regular/medium).

Evitar:

UI pesada com muitas bordas fortes, cinza chapado sem blur.

Muitos elementos decorativos sem função.

Coerência com o layout atual

Antes de propor novos layouts ou telas, sempre analisar os arquivos de layout existentes, em especial:

components/layout/AppLayout*

components/layout/*

Páginas em app/**/page.tsx

Componentes compartilhados em components/**

Estilos globais em app/globals.css e qualquer components/ui/* já existente.

Ao criar novos componentes, telas ou estilos:

Não reinventar o layout (grade, espaçamentos, breakpoints, hierarquia de títulos) se o usuário não pedir explicitamente.

Reaproveitar as mesmas classes/utilitárias Tailwind, padrões de espaçamento, bordas, sombras e blur já usados nos layouts atuais.

Respeitar os padrões de glassmorphism já definidos (mesmo “tipo” de card, nível de blur, opacidade, radius).

Se precisar de mudança estrutural (layout de colunas, navegação, barras laterais):

Explicar/justificar a mudança.

Manter coerência visual com o resto do app ao invés de criar um visual totalmente desconectado.

Responsividade e mobile-first

Abordagem mobile-first:

Projetar primeiro pensando em telas pequenas (ex.: ~360–400px de largura) e depois expandir para tablet/desktop, adicionando complexidade só quando houver espaço. 
Ecorn
+1

Em Tailwind, comece pelos estilos base (mobile) e vá adicionando sm:, md:, lg: apenas quando necessário.

Breakpoints e grids:

Usar poucos breakpoints bem escolhidos (por exemplo: mobile, tablet, desktop), baseados em quando o conteúdo começa a “apertar” ou ficar com muita linha quebrada, e não em modelos específicos de dispositivo. 
bookmarkify.io
+1

Adotar grade fluida com flex/grid, deixando painéis empilhados no mobile (flex-col) e lado a lado apenas em md: ou superior.

Leitura e hierarquia em telas pequenas:

Priorizar o conteúdo mais importante no topo: título, KPI principal, ações primárias.

Evitar colunas múltiplas no mobile; preferir um fluxo vertical claro.

Manter margens e padding consistentes (mínimo ~8px entre elementos clicáveis) para dar respiro e legibilidade. 
designcode.io
+1

Áreas de toque e acessibilidade:

Botões, ícones clicáveis e itens de lista acionáveis devem ter área de toque mínima próxima de 44×44 pts / 48×48 dp ou cerca de 1 cm × 1 cm para evitar “fat finger errors”. 
learnui.design
+3
Medium
+3
M&M Communications
+3

Usar espaçamento suficiente entre toques (ex.: gap/padding) para não agrupar botões demais.

Safe areas e barras do sistema (iOS-like):

Evitar colocar conteúdo relevante embaixo de notches, barras de navegação ou indicadores de home; respeitar “áreas seguras” (safe areas). 
Apple Developer
+2
median.co
+2

Em layouts tipo app (headers fixos, bottom bars), considerar sempre um padding superior/inferior consistente.

Boas práticas práticas com Tailwind:

Começar com:

w-full, flex-col, gap-*, px-4 no mobile.

Mudar para md:flex-row, md:grid-cols-2/3 só quando o conteúdo justificar.

Ajustar tipografia responsiva:

text-sm no mobile, md:text-base / lg:text-lg para dashboards mais amplos.

Evitar overflow horizontal; se inevitável (tabelas), usar contêiner com overflow-x-auto bem delimitado.

Consistência de comportamento:

Novos cards ou gráficos devem:

Funcionar bem em viewport estreita sem zoom manual.

Seguir o mesmo padrão de interação (filtros, dropdowns, tooltips) já usado no dashboard.

Sempre que criar uma nova tela/painel, pensar em:

“Como essa tela se comporta em 375px (iPhone SE)?”

“Como ela se reorganiza em 768px (tablet) e 1024+ (desktop)?”

Runtime & Performance

app/dashboard/DashboardClient.tsx:

Cacheia resumo, situações e gráficos em localStorage com keys tiny_dash_state_v1:*.

Usa readCacheEntry + isCacheEntryFresh.

Sempre usar esses helpers e respeitar TTLs (~90–180s) em novos cards para não saturar /api/tiny/dashboard/resumo.

Listas com paginação (pedidos, produtos, etc.):

Devem passar por lib/staleCache.ts (staleWhileRevalidate).

Manter debounces/search-submit existentes ao invés de fetch com cache: 'no-store' a cada digitação.

PDF de compras:

Usa jspdf + jspdf-autotable com import dinâmico.

Manter botão com spinner “Gerando…” + estado desabilitado para evitar cliques duplicados.

Respeitar debounce ~350ms ao recalcular sugestões.

Para fluxos muito client-heavy:

Compartilhar requisições já existentes.

Checar caches antes de buscar de novo.

Honrar intervalos de auto-refresh configurados.

Scripts & Ops

Imports/backfills históricos:

npm run sync:month -- --start=YYYY-MM-DD --end=YYYY-MM-DD
→ também enriquece frete/canais.

Outros scripts de operação:

Em scripts/README.md, focados hoje em enriquecimentos históricos; novos pedidos já vêm enriquecidos (frete + canal).

Loop de desenvolvimento:

npm run dev + npm run dev:cron (ou npm run dev:full com concurrently).

Logs:

Banco → sync_logs

Cron local → dev-cron.log

SQL:

Pg_cron/pg_net: supabase/migrations/.

Schema geral: migrations/ (via scripts helpers).

Ambiente & Gotchas

Variáveis obrigatórias:

NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_ANON_KEY

SUPABASE_SERVICE_ROLE_KEY

TINY_CLIENT_ID

TINY_CLIENT_SECRET

TINY_REDIRECT_URI

Opcionais:

TINY_TOKEN_URL

PROCESS_IN_APP

PROCESS_BATCH_DAYS

FRETE_ENRICH_MAX_PASSES

ENABLE_INLINE_FRETE_ENRICHMENT

CHANNEL_NORMALIZE_MAX_PASSES, CHANNEL_NORMALIZE_MAX_BATCH

GEMINI_API_KEY / GOOGLE_GEMINI_API_KEY

GEMINI_API_BASE_URL, GEMINI_API_VERSION

CRON_SECRET

Respeitar rate limits do Tiny:

Manter batch sizes/delays de runFreteEnrichment, sincronizarItensPorPedidos e helpers de listagem.

Ao escrever em tiny_orders, usar upsertOrdersPreservingEnriched para não apagar frete/canal/cidade/uf.

SQL de cron/trigger:

URLs hardcoded para https://gestor-tiny.vercel.app.

Se o domínio de produção mudar, atualizar as migrations correspondentes.

Backups locais:

Padrão backup-gestor-tiny-YYYYMMDD.tar.gz.

Excluir .git, node_modules, .next e tarballs anteriores.

Dumps de banco ficam em supabase-export/ ou gerados via supabase db dump/export (evitar versionar arquivos gigantes).

Fluxos padrão: migrations, commit e deploy (CLI)

IMPORTANTE: No ambiente do VS Code, assuma que você TEM permissão para usar terminal, Supabase CLI, Git e Vercel CLI quando o usuário pedir explicitamente para rodar migrations, fazer commit ou deploy.

1. Fluxo de migration (schema public)

Quando o usuário pedir para alterar o schema ou criar algo novo no banco:

Criar migration:

supabase migration new minha_mudanca_descritiva


Editar migration:

Abrir o arquivo gerado em supabase/migrations/... e escrever o SQL respeitando:

Baseline v2 intocável (20251126000000_v2_public_baseline.sql).

Apenas schema public (não alterar auth, storage, realtime).

Testar localmente (sem --linked):

supabase stop --all
supabase start
supabase db reset


Aplicar no projeto remoto:

supabase db push --linked


Nunca sugerir supabase db reset --linked.

Quando o usuário pedir “faça a migration”, você deve:

Criar o arquivo.

Escrever o SQL.

Rodar os comandos acima automaticamente no terminal.

2. Fluxo de Git: revisar, adicionar e commitar

Quando terminar uma alteração (código, migrations, UI, etc.) e o usuário pedir “faz o commit”:

Revisar status/diffs:

git status
git diff


Adicionar arquivos relevantes:

Selecionar arquivos ou usar git add . quando fizer sentido.

Criar commit com mensagem clara (padrão leve de conventional commits):

git commit -m "feat(dashboard): adiciona card de resumo por canal"


Outros exemplos:

chore(migrations): ajusta trigger de sync de itens

fix(sync): corrige enrich de frete em pedidos antigos

(Opcional) Enviar para o remoto quando fizer sentido:

git push


Se o usuário pedir explicitamente “faz o push”, execute o comando.

3. Fluxo de deploy (Vercel)

Quando o usuário pedir “faz o deploy” / “deploy em produção”:

Verificar package.json:

Se existir script específico, usar:

npm run deploy


ou o script configurado.

Se não houver script dedicado, usar Vercel CLI diretamente a partir da raiz:

vercel --prod


ou

vercel deploy --prod


Acompanhar o output no terminal:

Se houver erros, ajustar o código/configuração e tentar novamente.

Se o deploy for bem-sucedido, informar a URL final (output da Vercel CLI).

Não diga que “não tem acesso ao CLI” — neste contexto, assuma que o terminal está disponível e execute os comandos necessários quando solicitado.