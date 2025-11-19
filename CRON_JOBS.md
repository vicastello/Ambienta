# Automação de Sincronização e Enriquecimento de Frete

## 🔄 Cron Jobs Configurados

Dois cron jobs foram configurados no `vercel.json` para automatizar a sincronização e enriquecimento:

### 1. Sincronização de Pedidos
- **Endpoint**: `GET /api/tiny/sync/cron`
- **Frequência**: A cada 6 horas (0 */6 * * *)
- **O que faz**: 
  - Busca pedidos dos últimos 7 dias da API Tiny
  - Insere ou atualiza na tabela `tiny_orders`
  - Processa até 200 pedidos por página

### 2. Enriquecimento de Frete
- **Endpoint**: `GET /api/tiny/sync/enrich-frete-cron`
- **Frequência**: A cada 6 horas, 30 minutos após sincronização (30 */6 * * *)
- **O que faz**:
  - Busca pedidos dos últimos 7 dias SEM `valorTotalPedido`
  - Chama `/pedidos/{id}` da API Tiny para obter dados detalhados
  - Calcula e armazena:
    - `valorTotalPedido` (faturamento bruto)
    - `valorTotalProdutos` (faturamento líquido)
    - `valorFrete` (diferença entre bruto e líquido)
  - Atualiza o JSON `raw` na tabela `tiny_orders`

## 📋 Cronograma

Por padrão, os crons são executados a cada **6 horas**:

| Horário | Cron | O quê |
|---------|------|-------|
| 00:00 | Sincronização | Busca pedidos do Tiny |
| 00:30 | Enriquecimento | Adiciona dados de frete |
| 06:00 | Sincronização | Busca pedidos do Tiny |
| 06:30 | Enriquecimento | Adiciona dados de frete |
| 12:00 | Sincronização | Busca pedidos do Tiny |
| 12:30 | Enriquecimento | Adiciona dados de frete |
| 18:00 | Sincronização | Busca pedidos do Tiny |
| 18:30 | Enriquecimento | Adiciona dados de frete |

## 🚀 Deployment

### Com Vercel

1. Deploy normalmente:
   ```bash
   git add .
   git commit -m "Add cron jobs"
   git push
   ```

2. Os crons serão ativados automaticamente no Vercel

3. Monitore em:
   - Dashboard Vercel → Crons
   - Logs da execução

### Localmente (para teste)

Teste manualmente os endpoints:

```bash
# Teste de sincronização
curl -H "Authorization: Bearer test-token" \
  http://localhost:3000/api/tiny/sync/cron

# Teste de enriquecimento
curl -H "Authorization: Bearer test-token" \
  http://localhost:3000/api/tiny/sync/enrich-frete-cron
```

## ⚙️ Customização

Para alterar a frequência, edite `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/tiny/sync/cron",
      "schedule": "0 */12 * * *"  // A cada 12 horas
    },
    {
      "path": "/api/tiny/sync/enrich-frete-cron",
      "schedule": "30 */12 * * *"  // A cada 12 horas, 30 min depois
    }
  ]
}
```

## 🔐 Segurança

- Os crons são protegidos por header `Authorization`
- Vercel envia automaticamente o token ao chamar endpoints cron
- Não é necessário adicionar chave de API extra

## 📊 Monitoramento

Os crons registram:
- Início e fim da execução
- Número de pedidos processados
- Sucessos e erros
- Mensagens no console do Vercel

Acesse os logs em: **Vercel Dashboard → Logs → Crons**

## 🔔 Alertas e Notificações

Configure alertas no Vercel se um cron falhar:
- Vercel Dashboard → Settings → Alerts
- Receba notificações por email ou Slack

## 📝 Notas

- Os crons funcionam apenas em **produção** (Vercel)
- Localmente, você pode chamar manualmente ou usar `npm run sync:month`
- O período de 7 dias garante que nenhum pedido recente seja perdido
- O throttle de 200ms evita rate limiting da API Tiny
