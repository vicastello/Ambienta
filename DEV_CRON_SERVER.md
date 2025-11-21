# Servidor de Desenvolvimento com Tarefas Automáticas

## 🎯 Problema Resolvido

Em **produção no Vercel**, os cron jobs rodam automaticamente. Mas em **desenvolvimento local**, eles não funcionam. Este servidor simula os cron jobs localmente.

## 🚀 Como Usar

### Opção 1: Rodar apenas o servidor de cron (recomendado)

Em um terminal separado, rode:

```bash
npm run dev:cron
```

Isso vai:
- ✅ Sincronizar pedidos atualizados **a cada 2 horas**
- ✅ Sincronizar itens automaticamente
- ✅ Atualizar token **a cada 6 horas**
- ✅ Mostrar status a cada 30 minutos

### Opção 2: Rodar tudo junto (Next.js + Cron)

Primeiro, instale o pacote para rodar múltiplos processos:

```bash
npm install --save-dev concurrently
```

Depois rode:

```bash
npm run dev:full
```

Isso vai rodar o Next.js e o servidor de cron simultaneamente.

### Opção 3: Sincronização manual

Se preferir rodar manualmente quando precisar:

```bash
npx tsx scripts/syncPedidosUpdatedManual.ts
```

## 📊 O Que o Servidor Faz

### 1. Sincronização de Pedidos (a cada 2h)
- Busca pedidos atualizados nas últimas 6 horas
- Atualiza situações preservando frete e canal enriquecidos
- Sincroniza itens automaticamente

### 2. Refresh de Token (a cada 6h)
- Renova o token OAuth do Tiny automaticamente
- Evita problemas de token expirado

### 3. Logs e Monitoramento
- Registra todas as operações em `sync_logs`
- Mostra progresso no console
- Status a cada 30 minutos

## 🖥️ Exemplo de Saída

```
╔═════════════════════════════════════════════════════╗
║  🤖 SERVIDOR DE DESENVOLVIMENTO - TAREFAS AUTOMÁTICAS ║
╚═════════════════════════════════════════════════════╝

📝 Configuração:
  • Sincronização de pedidos: a cada 120 minutos
  • Refresh de token: a cada 360 minutos
  • Lookback: últimas 6 horas

💡 Pressione Ctrl+C para parar

─────────────────────────────────────────────────────

🚀 Executando primeira sincronização...

┌─────────────────────────────────────────────────────┐
│ 🔄 SINCRONIZAÇÃO AUTOMÁTICA DE PEDIDOS             │
└─────────────────────────────────────────────────────┘
⏰ 21/11/2025, 14:45:00

📅 Período: 2025-11-21 até hoje (últimas 6h)
📄 Página 1: 26 pedidos
📦 Sincronizando itens...
✅ 3 itens de 2 pedidos

┌─────────────────────────────────────────────────────┐
│ ✅ SINCRONIZAÇÃO CONCLUÍDA                          │
└─────────────────────────────────────────────────────┘
📊 Processados: 26 | Atualizados: 26
⏱️  Tempo: 2.5s

⏰ 15:15:00 - Sistema ativo (próxima sync em 1h 30m)
```

## ⚙️ Configuração

Você pode ajustar as configurações editando `scripts/devCronServer.ts`:

```typescript
// Intervalo de sincronização (padrão: 2 horas)
const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000;

// Intervalo de refresh de token (padrão: 6 horas)
const TOKEN_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Quantas horas olhar para trás (padrão: 6 horas)
const SYNC_UPDATED_HOURS = 6;
```

### Para testes rápidos (sincronizar a cada 5 minutos):

```typescript
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const SYNC_UPDATED_HOURS = 1; // Última hora
```

## 🛑 Como Parar

Pressione `Ctrl+C` no terminal. O servidor vai parar graciosamente:

```
🛑 Parando servidor...
✅ Servidor parado com sucesso
```

## 🔍 Monitoramento

### Ver logs no banco de dados:

```sql
SELECT * FROM sync_logs 
WHERE message LIKE '%automática%'
ORDER BY created_at DESC
LIMIT 10;
```

### Ver status dos pedidos de hoje:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const hoje = new Date().toISOString().split('T')[0];
const { data } = await supabase.from('tiny_orders').select('numero_pedido, canal, valor_frete').gte('data_criacao', hoje);
console.table(data);
"
```

## 📝 Notas Importantes

### Em Desenvolvimento:
- ✅ Use `npm run dev:cron` em um terminal separado
- ✅ O servidor roda em background
- ✅ Sincroniza automaticamente a cada 2 horas
- ⚠️ Lembre de iniciar o servidor quando começar a trabalhar

### Em Produção (Vercel):
- ✅ Os cron jobs rodam automaticamente
- ✅ Configurados no `vercel.json`
- ✅ Não precisa do servidor de dev
- ✅ Deploy e pronto!

## 🐛 Troubleshooting

### Servidor não inicia

Verifique as variáveis de ambiente:
```bash
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

Se estiverem vazias, configure no `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=sua_url
SUPABASE_SERVICE_ROLE_KEY=sua_key
```

### Erro de token

Force um refresh manual:
```bash
npx tsx -e "
import { getAccessTokenFromDbOrRefresh } from './lib/tinyAuth';
await getAccessTokenFromDbOrRefresh();
console.log('Token atualizado!');
"
```

### Nenhum pedido encontrado

Normal! Isso significa que não houve atualizações nas últimas 6 horas. O servidor continuará verificando.

## 🎯 Workflow Recomendado

### Para desenvolvimento diário:

1. **Inicie o servidor de cron** (uma vez ao começar o dia):
   ```bash
   npm run dev:cron
   ```

2. **Em outro terminal, rode o Next.js**:
   ```bash
   npm run dev
   ```

3. **Trabalhe normalmente** - pedidos serão sincronizados automaticamente a cada 2h

4. **Quando terminar**, pare ambos com `Ctrl+C`

### Para desenvolvimento rápido (sem esperar 2h):

```bash
# Sincronizar agora
npx tsx scripts/syncPedidosUpdatedManual.ts

# Enriquecer fretes de hoje
npx tsx scripts/enrichToday.ts

# Sincronizar itens dos últimos 2 dias
npx tsx scripts/forceSyncItensRecent.ts 2
```

## 📚 Outros Scripts Úteis

```bash
# Ver pedidos recentes
npx tsx scripts/checkRecent.ts

# Ver fretes de hoje
npx tsx scripts/checkTodayFrete.ts

# Forçar sync de situações do mês
npx tsx scripts/forceSyncSituacoes.ts

# Sincronizar itens
npx tsx scripts/syncPedidoItens.ts
```

---

**Status**: ✅ Sistema totalmente funcional em dev e produção
