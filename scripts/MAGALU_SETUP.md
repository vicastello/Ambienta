# Configuração OAuth Magalu - Instruções Completas

## 🎯 Objetivo

Registrar o `redirect_uri` da aplicação OAuth do Magalu para permitir a autenticação e integração com o marketplace.

## 📋 Pré-requisitos

- Conta no ID Magalu (pode usar a mesma do Portal do Seller)
- Sistema operacional: macOS, Linux ou Windows

## 🔧 Passo 1: Baixar a CLI IDM

1. Acesse: https://github.com/luizalabs/id-magalu-cli/releases/latest
2. Baixe a versão para seu sistema operacional:
   - macOS: `idm-darwin-amd64` (Intel) ou `idm-darwin-arm64` (M1/M2/M3)
   - Linux: `idm-linux-amd64` ou `idm-linux-arm64`
   - Windows: `idm-windows-amd64.exe`

3. **macOS/Linux:**
   ```bash
   # Renomear o arquivo baixado
   mv idm-darwin-* idm  # ou idm-linux-*

   # Tornar executável
   chmod +x idm

   # Mover para um diretório no PATH (opcional)
   sudo mv idm /usr/local/bin/
   ```

4. **Windows:**
   ```cmd
   # Renomear para idm.exe
   # Mover para C:\Windows\System32\ (ou adicionar ao PATH)
   ```

## 🔐 Passo 2: Fazer Login

```bash
./idm login
```

Isso abrirá o navegador para você fazer login com suas credenciais do Magalu.

## 🚀 Passo 3: Criar o Cliente OAuth

Execute o comando abaixo (ajuste as URLs se necessário):

```bash
./idm client create \
  --name "Gestor Tiny - Ambienta Utilidades" \
  --description "Sistema de gestão integrado com múltiplos marketplaces (Tiny, Shopee, Mercado Livre, Magalu)" \
  --terms-of-use "https://gestao.ambientautilidades.com.br/termos" \
  --privacy-term "https://gestao.ambientautilidades.com.br/privacidade" \
  --redirect-uris "http://localhost:3000/api/magalu/oauth/callback https://gestao.ambientautilidades.com.br/api/magalu/oauth/callback" \
  --audience "https://api.integracommerce.com.br https://services.magalu.com" \
  --scopes "openid profile email offline_access open:order-order:read open:portfolio:read"
```

### Parâmetros Explicados:

- `--redirect-uris`: URLs onde o código de autorização será enviado (localhost para dev + produção)
- `--audience`: URLs das APIs que você vai acessar
- `--scopes`: Permissões necessárias:
  - `openid profile email`: Dados básicos do usuário
  - `offline_access`: Para obter refresh_token
  - `open:order-order:read`: Acesso aos pedidos
  - `open:portfolio:read`: Acesso ao portfólio/produtos

## 📝 Passo 4: Salvar as Credenciais

O comando retornará algo como:

```json
{
  "client_id": "abc123...",
  "client_secret": "xyz789..."
}
```

**⚠️ IMPORTANTE:** O `client_secret` não pode ser recuperado depois! Salve em local seguro.

### Atualizar o .env.local:

```bash
MAGALU_CLIENT_ID=abc123...
MAGALU_CLIENT_SECRET=xyz789...
MAGALU_REDIRECT_URI=http://localhost:3000/api/magalu/oauth/callback
```

### Configurar no Vercel (Produção):

1. Acesse: https://vercel.com/seu-projeto/settings/environment-variables
2. Adicione as variáveis:
   - `MAGALU_CLIENT_ID`
   - `MAGALU_CLIENT_SECRET`
   - `MAGALU_REDIRECT_URI=https://gestao.ambientautilidades.com.br/api/magalu/oauth/callback`

## ✅ Passo 5: Testar a Integração

### Desenvolvimento (localhost):

```bash
npm run dev
```

Acesse: http://localhost:3000/marketplaces/magalu e clique em "Conectar com Magalu"

### Produção:

Acesse: https://gestao.ambientautilidades.com.br/marketplaces/magalu

## 🔄 Fluxo OAuth Completo

1. Usuário clica em "Conectar com Magalu"
2. Redireciona para `https://id.magalu.com/login` com os parâmetros
3. Seller faz login e autoriza os scopes
4. Magalu redireciona para seu `redirect_uri` com o `code`
5. Backend troca o `code` por `access_token` e `refresh_token`
6. Tokens são salvos e usados para chamar a API

## 📚 Referências

- [Criar Aplicação OAuth - Magalu Devs](https://developers.magalu.com/docs/first-steps/create-an-application/create-application/index.html)
- [Autenticação e Autorização - Magalu Devs](https://developers.magalu.com/docs/first-steps/create-an-application/authentication-authorization/index.html)
- [IDM CLI Releases](https://github.com/luizalabs/id-magalu-cli/releases/latest)
- [API Integra Commerce](https://api.integracommerce.com.br/Documentation/)

## 🆘 Problemas Comuns

### Erro: "Invalid redirect_uri"
- Certifique-se de que a URL está exatamente igual à configurada no cliente OAuth
- Verifique se adicionou tanto localhost quanto produção

### Erro: "Invalid client_id or client_secret"
- Confirme que copiou corretamente as credenciais
- Verifique se as variáveis de ambiente estão carregadas

### Erro: "Insufficient scopes"
- Revise os scopes necessários na documentação da API
- Recrie o cliente com os scopes corretos

## 💡 Dica

Se você já tinha credenciais antigas (como as que estão no .env.local atual), elas provavelmente foram criadas sem o `redirect_uri` correto. Você tem duas opções:

1. **Criar novo cliente** (recomendado): Seguir este guia
2. **Atualizar cliente existente**: Use `./idm client update <client_id>` (se a CLI suportar)
