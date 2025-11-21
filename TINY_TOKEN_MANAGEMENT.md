# Gerenciamento de Tokens do Tiny ERP

## Problema
As credenciais do Tiny (CLIENT_ID e CLIENT_SECRET) podem mudar periodicamente, e os tokens OAuth têm expiração.

## Solução Implementada

### 1. Armazenamento Seguro
Todos os tokens são armazenados na tabela `tiny_tokens` no Supabase:
```sql
CREATE TABLE tiny_tokens (
  id INTEGER PRIMARY KEY DEFAULT 1,
  access_token TEXT,
  refresh_token TEXT,
  expires_at BIGINT,  -- timestamp em ms
  scope TEXT,
  token_type TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### 2. Renovação Automática

#### Sistema de Auto-Renovação
- **Biblioteca `tinyAuth.ts`**: Verifica automaticamente a validade do token antes de cada chamada à API
- **Margem de Segurança**: Renova 60 segundos antes da expiração
- **Fallback**: Usa refresh_token para obter novo access_token

#### Cron Job Automático
- **Endpoint**: `/api/admin/cron/refresh-tiny-token`
- **Frequência**: A cada 6 horas
- **Função**: Verifica e renova tokens proativamente
- **Trigger**: Renova se faltam menos de 4 horas para expirar

#### Configuração no `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/admin/cron/refresh-tiny-token",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

### 3. Renovação Manual

#### Endpoint de Refresh Manual
```bash
# Verificar status do token
curl https://seu-dominio.vercel.app/api/tiny/auth/refresh

# Forçar renovação
curl -X POST https://seu-dominio.vercel.app/api/tiny/auth/refresh
```

Resposta de status:
```json
{
  "success": true,
  "connected": true,
  "tokenValid": true,
  "expiresAt": "2025-11-22T10:30:00.000Z",
  "expiresIn": 21600,
  "scope": "...",
  "needsAuth": false,
  "needsRefresh": false
}
```

### 4. Quando Mudam as Credenciais

#### Passo 1: Atualizar Variáveis de Ambiente
No Vercel ou `.env.local`:
```bash
TINY_CLIENT_ID=novo_client_id
TINY_CLIENT_SECRET=novo_client_secret
```

#### Passo 2: Reconectar (se necessário)
Se o refresh_token também ficou inválido:
1. Acesse: `https://seu-dominio.vercel.app/api/tiny/auth/login`
2. Autorize no Tiny
3. Sistema salvará automaticamente os novos tokens

#### Passo 3: Testar
```bash
# Verificar status
curl https://seu-dominio.vercel.app/api/tiny/auth/refresh

# Ou forçar renovação
curl -X POST https://seu-dominio.vercel.app/api/tiny/auth/refresh
```

### 5. Monitoramento

#### Logs no Supabase
Todos os eventos são registrados na tabela `sync_logs`:
```sql
SELECT * FROM sync_logs 
WHERE message LIKE '%token%' 
ORDER BY created_at DESC 
LIMIT 10;
```

#### Verificação de Status
```bash
# Script de verificação
npx tsx scripts/checkToken.ts
```

### 6. Troubleshooting

#### Token Inválido
**Erro**: "Invalid API key" ou 401 Unauthorized
**Solução**:
1. Verificar se CLIENT_ID/SECRET estão corretos
2. Forçar renovação: `POST /api/tiny/auth/refresh`
3. Se falhar, reconectar: `/api/tiny/auth/login`

#### Refresh Token Expirado
**Erro**: "Refresh token inválido ou expirado"
**Solução**: Reconectar via `/api/tiny/auth/login`

#### Credenciais Mudaram
**Sintoma**: Renovação automática começa a falhar
**Solução**:
1. Atualizar `TINY_CLIENT_ID` e `TINY_CLIENT_SECRET`
2. Deploy no Vercel
3. Reconectar se necessário

### 7. Fluxo Completo

```
┌─────────────────────────────────────────────────────┐
│  Sistema detecta token próximo de expirar           │
│  (< 60s para expirar ou < 4h no cron)              │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│  Busca refresh_token do Supabase (tiny_tokens)      │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│  Chama Tiny OAuth com CLIENT_ID/SECRET atuais       │
│  POST /realms/tiny/protocol/openid-connect/token    │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│  Recebe novo access_token + novo refresh_token      │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│  Salva no Supabase (tiny_tokens)                    │
│  + Log de sucesso (sync_logs)                       │
└─────────────────────────────────────────────────────┘
```

### 8. Segurança

- ✅ Tokens nunca expostos no frontend
- ✅ Armazenados no Supabase com RLS
- ✅ Cron protegido por `CRON_SECRET`
- ✅ Logs de todas as operações
- ✅ Renovação proativa antes de expirar

### 9. Manutenção Zero

Uma vez configurado:
1. ✅ Sistema renova tokens automaticamente a cada 6h
2. ✅ Verifica antes de cada chamada à API
3. ✅ Logs automáticos de sucesso/falha
4. ✅ Não requer intervenção manual

**Única ação manual necessária**: Reconectar via `/api/tiny/auth/login` se:
- Credenciais (CLIENT_ID/SECRET) mudarem E
- Refresh token anterior ficou inválido

### 10. Variáveis de Ambiente Necessárias

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Tiny ERP
TINY_CLIENT_ID=xxx
TINY_CLIENT_SECRET=xxx
TINY_REDIRECT_URI=http://localhost:3000/api/tiny/auth/callback

# Segurança (opcional, recomendado para produção)
CRON_SECRET=algum_segredo_forte

# Token URL (opcional, tem default)
TINY_TOKEN_URL=https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token
```
