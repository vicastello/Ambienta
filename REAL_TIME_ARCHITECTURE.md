# Arquitetura de Sincronização - Diagrama Técnico

## 1️⃣ Fluxo Atual (Polling Básico)

```
┏━━━━━━━━━━━━━━━━━━━━┓
┃  API Tiny V3       ┃ (120 req/min limit)
┃  (Fonte de Dados)  ┃
┗━━━━━━━━━━━━━━━━━━━━┛
         ▲
         │
         │ GET pedidos (últimos 90 dias)
         │
┌─────────────────────┐
│  VERCEL CRONS       │
├─────────────────────┤
│ Cron 1: A cada 5min │ ← enrich-background
│ └─ 10 pedidos/vez   │
│   └─ Detalhes       │
│   └─ frete, totais  │
│                     │
│ Cron 2: A cada 30min│ ← sync-cron  
│ └─ 90 dias completo │
│   └─ situacao       │
│   └─ status         │
└─────────────────────┘
         │
         │ UPSERT
         ▼
┏━━━━━━━━━━━━━━━━━━━━┓
┃  SUPABASE (Cache)  ┃
┃  tiny_orders table ┃
┗━━━━━━━━━━━━━━━━━━━━┛
         ▲
         │
         │ SELECT (muito rápido)
         │
┌─────────────────────┐
│  DASHBOARD (Browser)│
├─────────────────────┤
│  GET /api/resumo    │
│  └─ Filtra em mem   │
│  └─ Retorna JSON    │
│  └─ <1 segundo      │
└─────────────────────┘


⏱️ LATÊNCIA DE ATUALIZAÇÕES:
├─ Novo pedido aparece: até 30 minutos
├─ Mudança de situação: até 30 minutos
├─ Frete enriquecido: até 5 minutos
└─ Dashboard refresh: manual (F5)
```

---

## 2️⃣ Melhorias Recomendadas

### A. Polling Diferencial + Dual Cron

```
┏━━━━━━━━━━━━━━━━━━━━┓
┃  API Tiny V3       ┃
┃  (120 req/min)     ┃
┗━━━━━━━━━━━━━━━━━━━━┛
    ▲              ▲
    │              │
    │ FAST SYNC    │ FULL SYNC
    │ (5 min)      │ (30 min)
    │              │
┌───────────┬──────────┐
│ VERCEL    │ CRONS    │
├───────────┼──────────┤
│ /cron     │ /cron-   │
│ -fast     │ full     │
│           │          │
│ Últimos   │ Últimos  │
│ 7 dias    │ 90 dias  │
│           │          │
│ Apenas    │ Todos    │
│ mudou ou  │ que não  │
│ novo      │ foram    │
│           │ checados │
│           │ recente  │
└───────────┴──────────┘
    │              │
    │ UPSERT       │ UPSERT
    └──────┬───────┘
           ▼
    ┏━━━━━━━━━━━━━━━━┓
    ┃  SUPABASE      ┃
    ┃  (100% atual)  ┃
    ┗━━━━━━━━━━━━━━━━┛
           ▲
           │
           │ SELECT (cache hit)
           │
    ┌──────────────────┐
    │ DASHBOARD + SSE  │
    │ Auto-refresh 30s │
    └──────────────────┘


⏱️ LATÊNCIA MELHORADA:
├─ Novo pedido: até 5 minutos ⚡
├─ Mudança: até 30 minutos
├─ Frete: até 5 minutos
└─ Dashboard: real-time (30s)
```

---

## 3️⃣ Comparação de Custos

### Polling Atual (seu sistema)
```
Requisições por dia: ~288 (120 req × 2.4 vezes por dia)
Custo: GRÁTIS (dentro do limite do Tiny)
Latência: 5-30 minutos
Confiabilidade: ⭐⭐⭐⭐⭐ (100%)
```

### Polling Diferencial (recomendado)
```
Requisições por dia: ~480 (cron-fast adicional)
Custo: GRÁTIS (ainda dentro do limite)
Latência: 5 minutos para novos ⚡
Confiabilidade: ⭐⭐⭐⭐⭐ (100%)
```

### Webhooks (alternativa)
```
Requisições por dia: ~100 (sob demanda)
Custo: GRÁTIS (apenas setup)
Latência: <500ms (tempo real!)
Confiabilidade: ⭐⭐⭐ (pode falhar se Tiny cair)
```

---

## 4️⃣ Matriz de Decisão

| Métrica | Polling Atual | Polling Fast | Webhooks |
|---------|--------------|-------------|----------|
| Custo | $0 | $0 | $0 |
| Implementação | ✅ Pronta | 30 min | 3+ horas |
| Latência | 30 min | 5 min | <500ms |
| Confiabilidade | 99.9% | 99.9% | 95% |
| Complexidade | Baixa | Média | Alta |
| Manutenção | Mínima | Mínima | Média |
| Escala | ∞ | ∞ | Limitada |

### **Recomendação: Polling Fast** ✨

---

## 5️⃣ Implementação da Estratégia Polling Diferencial

### SQL - Adicionar Rastreamento
```sql
-- 1. Adicionar colunas de rastreamento
ALTER TABLE tiny_orders 
ADD COLUMN IF NOT EXISTS last_sync_check TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS data_hash VARCHAR(32),
ADD COLUMN IF NOT EXISTS is_enriched BOOLEAN DEFAULT FALSE;

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_tiny_orders_last_sync 
ON tiny_orders(last_sync_check);

CREATE INDEX IF NOT EXISTS idx_tiny_orders_data_criacao 
ON tiny_orders(data_criacao DESC);

CREATE INDEX IF NOT EXISTS idx_tiny_orders_is_enriched 
ON tiny_orders(is_enriched) 
WHERE is_enriched = FALSE;
```

### Lógica de Cron Fast
```typescript
// /api/tiny/sync/cron-fast (NEW)

export async function GET(req: NextRequest) {
  // Sincronizar apenas últimos 7 dias
  const hoje = new Date();
  const dataFinal = hoje.toISOString().slice(0, 10);
  const dataInicial = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Buscar do API Tiny
  const page = await listarPedidosTinyPorPeriodo(accessToken, {
    dataInicial,
    dataFinal,
    limit: 100,
  });

  // Para cada pedido
  for (const item of page.itens) {
    const tinyId = item.id;
    
    // Calcular hash do item novo
    const newHash = md5(JSON.stringify(item));
    
    // Buscar hash anterior
    const { data: existing } = await supabaseAdmin
      .from('tiny_orders')
      .select('data_hash')
      .eq('tiny_id', tinyId)
      .single();

    // Se mudou (ou é novo), atualizar
    if (!existing || existing.data_hash !== newHash) {
      await supabaseAdmin
        .from('tiny_orders')
        .upsert({
          tiny_id: tinyId,
          raw: item,
          data_hash: newHash,
          last_sync_check: new Date(),
          situacao: item.situacao,
        });
    }
  }
}
```

---

## 6️⃣ Dashboard com Auto-Refresh

```typescript
// app/dashboard/page.tsx - Adicionar ao useEffect

useEffect(() => {
  // Fetch inicial
  fetchDashboard();

  // Refetch a cada 30 segundos
  const interval = setInterval(() => {
    fetchDashboard({ skipCache: true });
  }, 30000);

  // Limpar ao desmontar
  return () => clearInterval(interval);
}, []);

// Com loader de atualização
const [isRefreshing, setIsRefreshing] = useState(false);

async function fetchDashboard(opts?: { skipCache?: boolean }) {
  setIsRefreshing(true);
  try {
    const url = new URL('/api/tiny/dashboard/resumo', window.location.origin);
    if (opts?.skipCache) url.searchParams.set('_t', Date.now().toString());
    
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    setResumo(data);
  } finally {
    setIsRefreshing(false);
  }
}
```

---

## 7️⃣ Notificações em Tempo Real (Opcional - Fase 2)

### Via SSE (Server-Sent Events)
```typescript
// /api/tiny/sync/notifications

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  
  const customReadable = new ReadableStream({
    async start(controller) {
      // Enviar update a cada mudança
      const handleChange = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Escutar por mudanças no banco (polling de 30s)
      const interval = setInterval(async () => {
        const { data } = await supabaseAdmin
          .from('tiny_orders')
          .select('*')
          .gte('updated_at', new Date(Date.now() - 30000))
          .limit(10);

        if (data?.length) {
          handleChange({ type: 'update', data });
        }
      }, 30000);

      return () => clearInterval(interval);
    }
  });

  return new Response(customReadable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

---

## 📋 Checklist de Implementação

### Fase 1: Smart Polling (30 min)
- [ ] Adicionar colunas SQL (last_sync_check, data_hash, is_enriched)
- [ ] Criar índices no Supabase
- [ ] Implementar lógica de hash no cron atual

### Fase 2: Dual Cron (30 min)
- [ ] Criar `/api/tiny/sync/cron-fast` (para 7 dias)
- [ ] Atualizar `vercel.json` com novo cron
- [ ] Testar em staging

### Fase 3: Auto-Refresh Dashboard (20 min)
- [ ] Adicionar interval no dashboard
- [ ] Implementar loader visual
- [ ] Testar performance

### Fase 4: Notificações (Opcional - 1 hora)
- [ ] Implementar SSE
- [ ] Conectar no dashboard com fetch EventSource
- [ ] Mostrar notificações toast

---

## 🎯 Cronograma Recomendado

```
Semana 1: Fase 1 + Fase 2 (1 hora de trabalho)
└─ Resultado: Atualizações a cada 5 minutos

Semana 2: Fase 3 (30 min)
└─ Resultado: Dashboard refaz a cada 30s

Semana 3: Fase 4 (opcional)
└─ Resultado: Notificações em tempo real
```

---

## 📞 Dúvidas Comuns

**P: E se a API Tiny cair?**
A: Os crons tentam reconectar. Se falhar, a última sincronização fica em cache.

**P: Quanto tempo leva sincronizar 1000 pedidos?**
A: ~50 requisições × 600ms = 30 segundos + processamento = 1-2 minutos

**P: Posso usar webhooks do Tiny?**
A: Sim, mas precisa de acesso admin. Recomendo polling por segurança.

**P: Dashboard fica muito rápido com refresh 30s?**
A: Não, é apenas um GET no Supabase (~100ms) - muito rápido!

---

## 🏆 Resultado Final Esperado

✅ **Antes (Atual)**
- Dashboard atualiza manualmente (F5)
- Latência de 30 minutos para novos pedidos
- Limite de API respeitado mas não otimizado

✨ **Depois (Com Melhorias)**
- Dashboard atualiza automaticamente a cada 30 segundos
- Novos pedidos aparecem em 5 minutos
- Mudanças de situação em 30 minutos
- Melhor UX sem sobrecarregar API
- Zero custos adicionais

---

**Quer que eu implemente qualquer uma dessas fases? 🚀**
