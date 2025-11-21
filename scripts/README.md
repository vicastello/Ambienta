# Scripts de Manutenção

Este diretório contém scripts utilitários para operações de manutenção e sincronização do sistema.

## ⚡ IMPORTANTE: Enriquecimento Automático Ativo

**Novos pedidos agora entram já enriquecidos automaticamente:**
- ✅ **Frete** extraído direto do Tiny durante sincronização (`valorFrete`, `transportador.valorFrete`)
- ✅ **Canal** normalizado na inserção (`ecommerce.nome` → Shopee, Magalu, etc.)

Os scripts abaixo são úteis apenas para **processar dados históricos** ou **re-processar pedidos problemáticos**.

---

## Scripts Disponíveis

### `enrichAll.ts` — Enriquecimento em Lote
Processa pedidos existentes para preencher frete faltante e normalizar canais marcados como "Outros".

**Quando usar:**
- Após importar dados históricos anteriores a esta atualização
- Se notar muitos "Outros" que deveriam ser Shopee, Magalu, etc.
- Para forçar re-processamento de pedidos problemáticos

```bash
npx tsx scripts/enrichAll.ts
```

### `syncMonth.ts` — Sincronização por Período
Sincroniza pedidos do Tiny para um intervalo de datas específico.

```bash
npm run sync:month -- --start=2025-11-01 --end=2025-11-30
```

Requisitos de ambiente (defina no seu servidor ou localmente):

- `NEXT_PUBLIC_SUPABASE_URL` (ex: `https://xyz.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` (service role key do Supabase)
- `TINY_CLIENT_ID` (OAuth client id do Tiny)
- `TINY_CLIENT_SECRET` (OAuth client secret do Tiny)
- (opcional) `TINY_TOKEN_URL` se você tiver um URL customizado

Como rodar localmente (exemplo):

```bash
# instalar deps (se ainda não instalou)
npm install

# rodar o script (usando ts-node via npm script adicionado)
npm run sync:month -- --start=2025-11-01 --end=2025-11-30
```

Observações:

- O script usa a função `getAccessTokenFromDbOrRefresh()` presente em `lib/tinyAuth.ts` — portanto
  é necessário que exista uma linha em `tiny_tokens` com um `refresh_token` (gerada quando você
  conectou o Tiny via OAuth no app) para que o token seja renovado automaticamente.
- O script grava um `sync_jobs` com `status` e `sync_logs` em caso de erro para que você consiga
  auditar a execução no banco.
- Para agendar: adicione uma entrada cron no servidor que rode o comando acima (ex.: `0 3 * * *`
  para rodar diariamente às 03:00). Exemplo de linha crontab:

```cron
# roda o sync do mês corrente no dia 1 às 03:00
0 3 1 * * cd /path/to/repo && /usr/bin/npm run sync:month -- --start=$(date +"%Y-%m-01") --end=$(date +"%Y-%m-%d") >> /var/log/syncMonth.log 2>&1
```

Se quiser, eu posso também criar uma versão JS (sem TypeScript) que não dependa do `ts-node`,
ou adaptar o script para rodar como um AWS Lambda / Cloud Run job.

---

## 📦 Sincronização de Produtos

### Sincronização Inicial
Sincroniza todos os produtos ativos do catálogo:

```bash
npx tsx scripts/syncProdutosInitial.ts
```

- Busca todos os produtos ativos
- Extrai detalhes e imagens
- Salva na tabela `tiny_produtos`
- ~1.148 produtos em ~3 minutos

### Job Automático
```bash
npx tsx scripts/jobSyncProdutos.ts
```

Ou via API:
```bash
curl -X POST http://localhost:3000/api/admin/cron/sync-produtos
```

**Agendamento (Vercel):** Configurado em `vercel.json` para rodar a cada 6 horas.

## 🛒 Itens dos Pedidos

### Sincronização Inicial
```bash
npx tsx scripts/syncPedidoItens.ts
```

- Extrai itens de todos os pedidos
- Salva na tabela `tiny_pedido_itens`
- ~1.000 pedidos em ~10 minutos

## 📊 Estrutura

- `tiny_produtos`: Produtos com imagens e estoque
- `tiny_pedido_itens`: Itens vendidos em cada pedido
- Dashboard: `/produtos`
