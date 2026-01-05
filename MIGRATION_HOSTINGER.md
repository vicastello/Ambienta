# MIGRATION_HOSTINGER.md

## 1. Deploy Settings (Hostinger Panel)

No painel Hostinger -> Sites -> Gerenciar -> **Aplicativo Node.js**:

*   **Node version**: 20 (LTS)
*   **Install command**: `npm install` (Desnecessário se rodar build localmente e subir `node_modules`, mas recomendado para garantir limpeza).
*   **Build command**: `npm run build`
*   **Start command**: `node .next/standalone/server.js` (Obrigatório, não use `npm start` se ele apontar para `next start` sem ser standalone)

## 2. Environment Variables

Configure as seguintes variáveis no painel da Hostinger. Baseado em `.env.example`:

### Essenciais (Boot do App)
*   `NEXT_PUBLIC_SUPABASE_URL`
*   `NEXT_PUBLIC_SUPABASE_ANON_KEY`
*   `SUPABASE_SERVICE_ROLE_KEY` (Obrigatório para rotas de admin)

### Integrações (Obrigatórias se usadas)
*   `TINY_API_BASE_URL`
*   `TINY_CLIENT_ID`
*   `TINY_CLIENT_SECRET`
*   `CRON_SECRET` (Crítico para segurança dos jobs agendados)

## 3. SSL

*   **Onde ativar**: Hostinger Panel -> Segurança -> SSL.
*   **Ação**: Instalar certificado SSL para `gestao.ambientautilidades.com.br`.
*   **Forçar HTTPS**: Sim.

## 4. Diagnóstico DNS (Crítico)

O subdomínio `gestao.ambientautilidades.com.br` deve ter **APENAS UM** registro apontando para a Hostinger.

*   **Tipo**: `A` (Apontando para o IP do seu plano VPS/Business) **OU** `CNAME` (Apontando para o domínio da Hostinger).
*   **Recomendado**: Se for hospedagem compartilhada/Cloud, use o IP fornecido no painel (Registro A).
*   **Validar**:
    ```bash
    dig gestao.ambientautilidades.com.br
    # Deve retornar APENAS o IP da Hostinger.
    ```
*   **Erro Comum**: Ter um CNAME para Vercel e um A para Hostinger ao mesmo tempo. Apague qualquer registro antigo da Vercel.

## 5. Supabase Configuration

No Dashboard do Supabase (Authentication -> URL Configuration):

1.  **Site URL**: Altere de `*.vercel.app` para `https://gestao.ambientautilidades.com.br`
2.  **Redirect URLs**:
    *   Adicione: `https://gestao.ambientautilidades.com.br/**`
    *   Remova: Qualquer URL terminada em `.vercel.app`.

*Se isso não for feito, o login por Magic Link ou OAuth falhará ou redirecionará para o site antigo desligado.*

## 6. Prova de Produção (Teste Pós-Deploy)

1.  Acesse `https://gestao.ambientautilidades.com.br/api/health`.
    *   **Sucesso**: Retorna `{"ok":true, "ts": ..., "env": "production"}`.
2.  Faça login no sistema.
3.  Teste o Cron (via terminal ou Postman):
    ```bash
    curl -H "Authorization: Bearer SEU_CRON_SECRET" https://gestao.ambientautilidades.com.br/api/admin/cron/refresh-tiny-token
    ```

---

**Status Final**: O projeto está configurado para ser um **Node.js Web App** Standalone, livre de dependências da Vercel.
