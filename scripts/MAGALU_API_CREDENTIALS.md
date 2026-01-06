# Como Obter Credenciais da API Magalu

## ⚠️ Credenciais Atualizadas

Novos valores fornecidos para a API IntegrCommerce:
- API Key: `7c7a8b42-39d7-4096-a9d6-234098becb75`
- API Key ID: `3bdbca17-a76a-40dd-8c40-9a15917d8885`
- API Key Secret: `71771755-198e-430a-8511-ddc10874c8d4`

Se ainda houver **401 Unauthorized** com essas credenciais, significa que elas estão:
1. **Inválidas/expiradas**
2. **Sem permissões** para acessar pedidos
3. **De ambiente errado** (teste vs produção)

## 📋 Como Obter Credenciais Corretas

### Opção 1: Portal do Seller Magalu (Recomendado)

1. Acesse: https://seller.magazineluiza.com.br/
2. Faça login com suas credenciais
3. Vá em **Configurações** > **Integrações** > **API**
4. Procure por:
   - "Gerar Nova Chave" ou "API Keys"
   - Seção de "IntegrCommerce" ou "API de Pedidos"
5. Copie:
   - **API Key ID** (ou Client ID)
   - **API Key Secret** (ou Client Secret)

### Opção 2: Portal IntegrCommerce Direto

1. Acesse: https://www.integracommerce.com.br/
2. Login com credenciais do Magalu
3. Vá em **Configurações** > **API**
4. Gere/copie as credenciais ativas

### Opção 3: Suporte Magalu

Se não encontrar no portal:
1. Abra chamado no suporte: https://ajuda.magazineluiza.com.br/
2. Solicite "Credenciais da API IntegrCommerce para acessar pedidos"
3. Informe que precisa de:
   - API Key ID
   - API Key Secret
   - Permissões para endpoint `/Order`

## 🔍 Verificando Credenciais

Quando obtiver novas credenciais, teste com:

```bash
# Substituir SEU_API_KEY_ID e SEU_API_KEY_SECRET
CREDENTIALS=$(echo -n "SEU_API_KEY_ID:SEU_API_KEY_SECRET" | base64)

curl -s "https://api.integracommerce.com.br/api/Order?page=1&perPage=5" \
  -H "Authorization: Basic $CREDENTIALS" \
  -H "Accept: application/json" | jq '.'
```

**Resposta esperada:**
- ✅ 200 OK + JSON com pedidos (ou array vazio se não tiver pedidos)
- ❌ 401 Unauthorized = Credenciais inválidas

## 📝 Atualizando no Sistema

Quando tiver credenciais válidas:

### 1. Atualizar `.env.local`:
```bash
MAGALU_API_KEY_ID=<novo_id_aqui>
MAGALU_API_KEY_SECRET=<novo_secret_aqui>
```

### 2. Atualizar no Hostinger:
No hPanel → **Node.js App → Environment Variables**:
```
MAGALU_API_KEY_ID=<novo_id_aqui>
MAGALU_API_KEY_SECRET=<novo_secret_aqui>
```

### 3. Testar Sincronização:
```bash
npx tsx scripts/magalu-sync-90d.ts
```

## 🚨 Possíveis Problemas

### Problema: "Não encontro seção de API no portal"

**Solução:** O Magalu pode ter migrado para OAuth 2.0 completamente. Nesse caso:
1. As credenciais antigas (API Keys) foram descontinuadas
2. Você precisa usar OAuth (já configurado no sistema!)
3. A API mudou de `api.integracommerce.com.br` para `api.magalu.com/seller/v1`

Se for esse o caso, me avise para atualizar o código para a nova API.

### Problema: "Credenciais funcionam mas não retornam pedidos"

**Solução:** Você pode não ter pedidos no Magalu ainda. Verifique:
1. Se tem vendas ativas no marketplace
2. Se a loja está aprovada e publicada
3. Se os pedidos estão no status correto

## 📚 Documentação Oficial

- IntegrCommerce API: https://in.integracommerce.com.br/Documentation/
- Magalu Developers: https://developers.magalu.com/
- Portal do Seller: https://seller.magazineluiza.com.br/

## ✅ Status Atual do Sistema

**Tudo pronto aguardando credenciais válidas:**
- ✅ Interface premium funcionando
- ✅ Banco de dados criado
- ✅ Script de sincronização pronto
- ✅ Cliente da API implementado
- ⏳ Aguardando credenciais que retornem 200 OK

Assim que tiver credenciais válidas, o sistema funcionará automaticamente!
