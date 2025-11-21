# 🎯 Sistema de Sincronização Automática - Guia Completo

## ✅ Problema Resolvido

**Antes**: Pedidos não eram atualizados automaticamente em desenvolvimento local.

**Agora**: Sistema completo que funciona tanto em **desenvolvimento** quanto em **produção**.

---

## 🚀 Como Usar

### Em Desenvolvimento Local

Você tem **3 opções**:

#### Opção 1: Servidor em Background (Recomendado) ⭐

```bash
# Iniciar servidor
./start-dev-cron.sh

# Ver logs
tail -f dev-cron.log

# Parar servidor
./stop-dev-cron.sh
```

**Vantagens:**
- ✅ Roda em background
- ✅ Não ocupa terminal
- ✅ Continua rodando mesmo se você fechar o terminal
- ✅ Fácil de iniciar/parar

#### Opção 2: Terminal Dedicado

```bash
npm run dev:cron
```

**Vantagens:**
- ✅ Ver logs em tempo real
- ✅ Fácil de parar (Ctrl+C)

#### Opção 3: Sincronização Manual

```bash
# Quando precisar
npx tsx scripts/syncPedidosUpdatedManual.ts
```

**Vantagens:**
- ✅ Controle total
- ✅ Não fica rodando em background

### Em Produção (Vercel)

**Não precisa fazer nada!** ✅

Os cron jobs rodam automaticamente conforme configurado no `vercel.json`.

---

## 📋 O Que Acontece Automaticamente

### A Cada 2 Horas (Desenvolvimento e Produção)

1. **Busca pedidos atualizados** nas últimas 6 horas
2. **Atualiza situações** preservando frete e canal enriquecidos
3. **Sincroniza itens** automaticamente
4. **Registra logs** em `sync_logs`

### A Cada 6 Horas

1. **Renova token OAuth** do Tiny automaticamente

---

## 🎬 Workflow Recomendado

### Início do Dia

```bash
# 1. Iniciar servidor de cron em background
./start-dev-cron.sh

# 2. Iniciar Next.js
npm run dev

# 3. Trabalhar normalmente
# Os pedidos são sincronizados automaticamente a cada 2h
```

### Durante o Desenvolvimento

```bash
# Ver logs do servidor
tail -f dev-cron.log

# Sincronizar agora (sem esperar)
npx tsx scripts/syncPedidosUpdatedManual.ts

# Ver status dos pedidos
npx tsx scripts/checkRecent.ts
```

### Fim do Dia

```bash
# Parar servidor de cron
./stop-dev-cron.sh

# Parar Next.js (Ctrl+C no terminal)
```

---

## 📊 Monitoramento

### Ver Logs no Console

```bash
# Logs em tempo real
tail -f dev-cron.log

# Últimas 50 linhas
tail -n 50 dev-cron.log
```

### Ver Logs no Banco de Dados

```sql
SELECT 
  created_at,
  level,
  message,
  meta->>'totalProcessados' as processados,
  meta->>'totalAtualizados' as atualizados
FROM sync_logs 
WHERE message LIKE '%automática%'
ORDER BY created_at DESC
LIMIT 10;
```

### Ver Status dos Pedidos

```bash
# Pedidos de hoje
cat << 'EOF' | npx tsx
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const hoje = new Date().toISOString().split('T')[0];
const { data } = await supabase.from('tiny_orders').select('numero_pedido, canal, valor_frete, situacao').gte('data_criacao', hoje).order('numero_pedido', { ascending: false });
console.table(data);
EOF
```

---

## ⚙️ Configuração

### Ajustar Intervalos

Edite `scripts/devCronServer.ts`:

```typescript
// Padrão: 2 horas
const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000;

// Para testes: 5 minutos
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

// Para produção: 1 hora
const SYNC_INTERVAL_MS = 1 * 60 * 60 * 1000;
```

### Ajustar Lookback

```typescript
// Padrão: últimas 6 horas
const SYNC_UPDATED_HOURS = 6;

// Para ver mais pedidos: 12 horas
const SYNC_UPDATED_HOURS = 12;

// Para ver menos: 2 horas
const SYNC_UPDATED_HOURS = 2;
```

---

## 🔧 Scripts Úteis

### Sincronização

```bash
# Sincronizar pedidos atualizados
npx tsx scripts/syncPedidosUpdatedManual.ts

# Sincronizar itens dos últimos 2 dias
npx tsx scripts/forceSyncItensRecent.ts 2

# Sincronizar situações do mês
npx tsx scripts/forceSyncSituacoes.ts

# Enriquecer fretes de hoje
npx tsx scripts/enrichToday.ts
```

### Verificação

```bash
# Ver pedidos recentes
npx tsx scripts/checkRecent.ts

# Ver fretes de hoje
npx tsx scripts/checkTodayFrete.ts

# Verificar progresso
npx tsx scripts/checkProgress.ts

# Ver pedidos de hoje
npx tsx scripts/checkTodayCount.ts
```

### Debug

```bash
# Testar sync de pedidos atualizados
npx tsx scripts/testSyncUpdated.ts

# Debug de frete
npx tsx scripts/debugFrete.ts

# Teste simples
npx tsx scripts/simpleCheck.ts
```

---

## 🐛 Troubleshooting

### Servidor não inicia

**Problema:** `TypeError: fetch failed` ou erro de conexão

**Solução:**
```bash
# Verificar variáveis de ambiente
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# Se vazias, configurar no .env.local
cat > .env.local << EOF
NEXT_PUBLIC_SUPABASE_URL=sua_url
SUPABASE_SERVICE_ROLE_KEY=sua_key
EOF
```

### Servidor já está rodando

**Problema:** Mensagem "Servidor de cron já está rodando"

**Solução:**
```bash
# Ver se está realmente rodando
ps aux | grep devCronServer

# Parar servidor
./stop-dev-cron.sh

# Ou forçar parada
kill $(cat .dev-cron.pid)
rm .dev-cron.pid
```

### Nenhum pedido encontrado

**Problema:** Mensagem "Nenhum pedido atualizado encontrado"

**Resposta:** Isso é normal! Significa que não houve atualizações nas últimas 6 horas. O servidor continuará verificando automaticamente.

### Erro de token expirado

**Problema:** `401 Unauthorized` ou `Token inválido`

**Solução:**
```bash
# Forçar refresh de token
cat << 'EOF' | npx tsx
import { getAccessTokenFromDbOrRefresh } from './lib/tinyAuth';
await getAccessTokenFromDbOrRefresh();
console.log('✅ Token atualizado!');
EOF
```

### Erro ao salvar itens

**Problema:** `there is no unique constraint`

**Solução:** Já foi corrigido! Atualize o código:
```bash
git pull
# ou
npm run dev:cron  # reiniciar servidor
```

---

## 📈 Métricas

### Exemplo de Sincronização Bem-Sucedida

```
┌─────────────────────────────────────────────────────┐
│ 🔄 SINCRONIZAÇÃO AUTOMÁTICA DE PEDIDOS             │
└─────────────────────────────────────────────────────┘
⏰ 21/11/2025, 14:45:00

📅 Período: 2025-11-21 até hoje (últimas 6h)
📄 Página 1: 27 pedidos
📦 Sincronizando itens...
✅ 3 itens de 2 pedidos

┌─────────────────────────────────────────────────────┐
│ ✅ SINCRONIZAÇÃO CONCLUÍDA                          │
└─────────────────────────────────────────────────────┘
📊 Processados: 27 | Atualizados: 27
⏱️  Tempo: 3.4s
```

### O Que Significa

- **Processados**: Pedidos encontrados na busca
- **Atualizados**: Pedidos salvos no banco
- **Itens**: Produtos dos pedidos sincronizados
- **Tempo**: Duração total da operação

---

## 🎯 Resumo Final

### ✅ O Que Está Funcionando

- [x] Sincronização automática de pedidos a cada 2h
- [x] Preservação de frete e canal enriquecidos
- [x] Sincronização automática de itens
- [x] Refresh automático de token
- [x] Logs detalhados
- [x] Funciona em dev e produção
- [x] Scripts de controle fáceis

### 🎓 Como Usar

**Em Dev (Recomendado):**
```bash
./start-dev-cron.sh  # Uma vez ao começar o dia
npm run dev          # Terminal do Next.js
```

**Em Produção:**
```bash
# Só fazer deploy - cron roda automaticamente
vercel --prod
```

**Manual (quando precisar):**
```bash
npx tsx scripts/syncPedidosUpdatedManual.ts
```

---

## 📚 Documentação Adicional

- `DEV_CRON_SERVER.md` - Detalhes técnicos do servidor de cron
- `SYNC_PEDIDOS_UPDATED.md` - Sistema de atualização automática
- `SYNC_PEDIDO_ITENS.md` - Sincronização de itens
- `TINY_TOKEN_MANAGEMENT.md` - Gestão de tokens
- `SINCRONIZACAO.md` - Documentação geral

---

**Status**: ✅ Sistema 100% funcional e testado

**Última atualização**: 21/11/2025
