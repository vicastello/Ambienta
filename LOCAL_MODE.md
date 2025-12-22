# 🖥️ Modo Local - Guia de Uso

Enquanto o Vercel estiver bloqueado (até 31/12), siga este guia para usar o app localmente.

## Iniciar o App

**Terminal 1** - Servidor:
```bash
cd ~/projetos/gestor-tiny
npm run dev
```

**Terminal 2** - Sincronização automática:
```bash
cd ~/projetos/gestor-tiny
./scripts/local-sync.sh
```

## Acessar o App
Abra no navegador: **http://localhost:3000**

## O Que Acontece Automaticamente

| Tarefa | Intervalo |
|--------|-----------|
| Refresh token Tiny | A cada 30 min |
| Sync pedidos | A cada 30 min |
| Sync estoque | A cada 30 min |
| Auto-link | A cada 30 min |

## Sincronização Manual (se precisar)

```bash
# Sync completo
curl http://localhost:3000/api/tiny/sync

# Sync escrow Shopee (para pedido específico)
curl -X POST http://localhost:3000/api/marketplaces/shopee/sync-escrow \
  -H "Content-Type: application/json" \
  -d '{"orderSn": "SEU_PEDIDO"}'
```

## Quando Vercel Voltar (31/12)

Basta executar:
```bash
npx vercel --prod
```

Ou aguardar o deploy automático via GitHub.

> [!NOTE]
> Todos os dados sincronizados localmente vão para o mesmo Supabase.
> Nada precisa ser migrado quando o Vercel voltar.
