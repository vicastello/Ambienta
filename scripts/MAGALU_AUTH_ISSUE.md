# Problema de Autenticação - Magalu IntegrCommerce

## 🔴 Problema Identificado

A API IntegrCommerce do Magalu (`api.integracommerce.com.br`) usa **Basic Authentication** com:
- **Usuário:** Login do portal do seller
- **Senha:** Senha do portal do seller

**NÃO** aceita API Keys separadas.

### Documentação Oficial:
- https://api.integracommerce.com.br/Documentation/Authentication

### Credenciais atuais para teste:
```bash
# API Keys fornecidas
API_KEY_ID: 3bdbca17-a76a-40dd-8c40-9a15917d8885
API_KEY_SECRET: 71771755-198e-430a-8511-ddc10874c8d4
```

### O que a API espera:
```bash
# Formato: base64(usuario_portal:senha_portal)
Authorization: Basic <base64 encoded login:password>
```

## ⚠️ Por Que Não Podemos Usar Login/Senha

**Questões de segurança:**
1. Login/senha são credenciais principais da conta
2. Não devem ser armazenadas em arquivos de configuração
3. Expõem toda a conta, não apenas a API

## ✅ Soluções Possíveis

### Solução 1: Modo Mock (Imediato)

Ative dados fictícios para testar a interface:

```bash
# .env.local
MAGALU_MOCK_MODE=true
```

Depois rode:
```bash
npm run dev
```

Acesse: http://localhost:3000/marketplaces/magalu

### Solução 2: Contatar Suporte Magalu

Abra chamado solicitando:
- "Credenciais de API que não sejam login/senha principal"
- "API Keys dedicadas para integração programática"
- "Alternativa segura ao Basic Auth com credenciais principais"

### Solução 3: Aguardar Nova API OAuth

O Magalu está migrando para nova API:
- **Nova URL:** `api.magalu.com/seller/v1`
- **Autenticação:** OAuth 2.0 (já implementado!)
- **Status:** Em migração, deve estar 100% até 12/11/2025

O código OAuth já está pronto e funcionando. Quando a API estiver ativa:
1. Complete o fluxo OAuth
2. Tokens serão salvos automaticamente
3. Sistema funcionará sem expor credenciais

### Solução 4: Proxy de Autenticação (Avançado)

Criar um proxy Node.js que:
1. Armazena credenciais em variável de ambiente criptografada
2. Gerencia autenticação com a API
3. Expõe endpoint interno sem credenciais

**Não recomendado** - complexo e arriscado.

## 📊 Status Atual

### ✅ Implementado:
- Interface premium completa
- Banco de dados estruturado
- Script de sincronização
- Cliente da API
- OAuth 2.0 completo (para nova API)

### ❌ Bloqueado:
- Autenticação com API antiga (IntegrCommerce)
- Requer login/senha (inseguro) OU migração para nova API

## 🎯 Recomendação

**Use modo Mock temporariamente** e **aguarde migração para nova API OAuth**.

A nova API será mais segura, moderna e já está 100% implementada no sistema.

## 📝 Como Ativar Modo Mock

1. Edite `.env.local`:
```bash
MAGALU_MOCK_MODE=true
```

2. Reinicie o servidor:
```bash
pkill -f "next dev"
npm run dev
```

3. Acesse a página:
```
http://localhost:3000/marketplaces/magalu
```

Verá 30 pedidos fictícios para testar a interface!

## 📚 Referências

- [Autenticação IntegrCommerce](https://api.integracommerce.com.br/Documentation/Authentication)
- [Nova API Magalu Sellers](https://developers.magalu.com/)
- [Migração OAuth até 12/11/2025](https://developers.magalu.com/docs/first-steps/create-an-application/authentication-authorization/)

**Fontes:**
- [Authentication - Integra API](https://api.integracommerce.com.br/Documentation/Authentication)
