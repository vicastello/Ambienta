#!/bin/bash

# Script para criar cliente OAuth no Magalu via IDM CLI
# Execute após baixar e fazer login com ./idm login

echo "🔧 Criando cliente OAuth no Magalu..."
echo ""

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar se IDM está instalado
if ! command -v idm &> /dev/null
then
    echo -e "${RED}❌ IDM CLI não encontrado!${NC}"
    echo ""
    echo "Baixe em: https://github.com/luizalabs/id-magalu-cli/releases/latest"
    echo "Depois execute: chmod +x idm && sudo mv idm /usr/local/bin/"
    echo ""
    exit 1
fi

# Verificar se está logado
echo "Verificando autenticação..."
if ! idm profile show &> /dev/null
then
    echo -e "${RED}❌ Você não está logado!${NC}"
    echo ""
    echo "Execute primeiro: idm login"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Autenticado${NC}"
echo ""

# Criar cliente
echo -e "${BLUE}📝 Criando cliente OAuth...${NC}"
echo ""

idm client create \
  --name "Gestor Tiny - Ambienta Utilidades" \
  --description "Sistema de gestão integrado com múltiplos marketplaces (Tiny, Shopee, Mercado Livre, Magalu)" \
  --terms-of-use "https://gestao.ambientautilidades.com.br/termos" \
  --privacy-term "https://gestao.ambientautilidades.com.br/privacidade" \
  --redirect-uris "http://localhost:3000/api/magalu/oauth/callback https://gestao.ambientautilidades.com.br/api/magalu/oauth/callback" \
  --audience "https://api.integracommerce.com.br https://services.magalu.com" \
  --scopes "openid profile email offline_access open:order-order:read open:portfolio:read"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Cliente criado com sucesso!${NC}"
    echo ""
    echo -e "${BLUE}📋 Próximos passos:${NC}"
    echo "1. Copie o client_id e client_secret do output acima"
    echo "2. Atualize o .env.local:"
    echo "   MAGALU_CLIENT_ID=<client_id>"
    echo "   MAGALU_CLIENT_SECRET=<client_secret>"
    echo "3. Configure as mesmas variáveis no painel da Hostinger (produção)"
    echo "4. Teste em http://localhost:3000/marketplaces/magalu"
    echo ""
else
    echo ""
    echo -e "${RED}❌ Erro ao criar cliente!${NC}"
    echo ""
    echo "Verifique se:"
    echo "1. Você está logado: idm profile show"
    echo "2. Tem permissões necessárias no ID Magalu"
    echo "3. Os parâmetros estão corretos"
    echo ""
fi
