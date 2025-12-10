# Sistema de Vinculação de Pedidos e Relatórios de Vendas

Este documento explica como usar o novo sistema de vinculação de pedidos dos marketplaces (Magalu, Shopee, Mercado Livre) com pedidos do Tiny, e como gerar relatórios mensais com breakdown de kits e variações.

## Problema Resolvido

Anteriormente, não era possível obter relatórios precisos de vendas por SKU dos marketplaces porque:
1. Os pedidos do Tiny só mostram produtos "simples" (sem detalhamento de kits e variações)
2. Não havia vinculação entre pedidos dos marketplaces e pedidos do Tiny
3. Não era possível rastrear vendas de componentes individuais em kits

## Solução Implementada

### 1. Vinculação de Pedidos

**Página: `/relatorios/vinculos`**

Esta página permite vincular manualmente pedidos dos marketplaces com pedidos do Tiny.

#### Como usar:

1. Acesse a página de vinculação
2. Selecione o marketplace (Magalu, Shopee ou Mercado Livre)
3. Opcionalmente, filtre por período
4. Clique em "Atualizar" para carregar os pedidos
5. Na coluna esquerda, aparecem os **pedidos não vinculados** do marketplace
6. Na coluna direita, aparecem os **pedidos do Tiny** disponíveis
7. Selecione um pedido de cada lado
8. Clique em "Vincular Pedidos Selecionados"
9. Os pedidos vinculados aparecem na tabela inferior

#### Recursos:

- **Busca de pedidos do Tiny**: Use a barra de busca para encontrar por número do pedido, nome do cliente ou canal
- **Filtros de data**: Filtre pedidos por período para facilitar a localização
- **Desvincular**: Clique no ícone de desvincular na tabela de pedidos vinculados para remover uma vinculação
- **Estatísticas**: Veja quantos pedidos estão vinculados e não vinculados

### 2. Mapeamento de SKUs

**API: `/api/reports/sku-mappings`**

Além da vinculação de pedidos, você pode criar mapeamentos diretos entre SKUs dos marketplaces e produtos do Tiny.

#### Como usar via API:

```bash
# Criar mapeamento individual
curl -X POST http://localhost:3000/api/reports/sku-mappings \
  -H "Content-Type: application/json" \
  -d '{
    "marketplace": "magalu",
    "marketplace_sku": "SKU123456",
    "marketplace_product_name": "Produto Exemplo",
    "tiny_product_id": 12345,
    "mapping_type": "manual",
    "created_by": "usuario@email.com"
  }'

# Criar múltiplos mapeamentos (batch)
curl -X POST http://localhost:3000/api/reports/sku-mappings \
  -H "Content-Type: application/json" \
  -d '{
    "batch": true,
    "mappings": [
      {
        "marketplace": "shopee",
        "marketplace_sku": "SHOPEE-SKU-1",
        "tiny_product_id": 111
      },
      {
        "marketplace": "shopee",
        "marketplace_sku": "SHOPEE-SKU-2",
        "tiny_product_id": 222
      }
    ]
  }'

# Consultar mapeamentos de um marketplace
curl http://localhost:3000/api/reports/sku-mappings?marketplace=magalu

# Consultar mapeamentos de um produto do Tiny
curl http://localhost:3000/api/reports/sku-mappings?tiny_product_id=12345
```

### 3. Relatório de Vendas Mensais

**Página: `/relatorios/vendas-mensais`**

Esta página gera relatórios mensais detalhados com breakdown de kits e variações.

#### Como usar:

1. Acesse a página de vendas mensais
2. Selecione o **ano** e **mês** desejados
3. Escolha o **marketplace** (ou "Todos" para consolidar)
4. Clique em "Gerar Relatório"
5. Visualize as estatísticas e itens vendidos
6. Clique em "Exportar CSV" para baixar os dados

#### Recursos:

**Estatísticas Gerais:**
- Total de pedidos
- Total de itens vendidos
- Receita total
- Ticket médio

**Breakdown por Marketplace:**
- Quantidade de pedidos por marketplace
- Quantidade de itens por marketplace
- Receita por marketplace

**Breakdown por Tipo de Produto:**
- Vendas de produtos simples (S)
- Vendas de variações (V)
- Vendas de kits (K)
- Quantidade e receita de cada tipo

**Detalhamento de Kits:**
- Ao clicar na seta ao lado de um kit, você pode ver seus componentes individuais
- Os componentes mostram as quantidades vendidas (quantidade do kit × quantidade do componente)
- Útil para controle de estoque e compras

**Exportação CSV:**
- Exporta todos os itens vendidos no período
- Inclui informações do marketplace e do Tiny
- Pronto para análise em Excel ou outras ferramentas

## Estrutura do Banco de Dados

### Tabela: `marketplace_order_links`

Vincula pedidos dos marketplaces com pedidos do Tiny.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | BIGSERIAL | ID único |
| marketplace | VARCHAR(50) | 'magalu', 'shopee' ou 'mercado_livre' |
| marketplace_order_id | TEXT | ID do pedido no marketplace |
| tiny_order_id | BIGINT | ID do pedido no Tiny |
| linked_at | TIMESTAMPTZ | Data/hora da vinculação |
| linked_by | TEXT | Usuário que criou a vinculação |
| confidence_score | NUMERIC | Score de confiança (0.00 a 1.00) |
| notes | TEXT | Observações |

### Tabela: `marketplace_sku_mapping`

Mapeia SKUs dos marketplaces para produtos do Tiny.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | BIGSERIAL | ID único |
| marketplace | VARCHAR(50) | 'magalu', 'shopee' ou 'mercado_livre' |
| marketplace_sku | TEXT | SKU no marketplace |
| marketplace_product_name | TEXT | Nome do produto no marketplace |
| tiny_product_id | INTEGER | ID do produto no Tiny |
| mapping_type | VARCHAR(20) | 'manual', 'auto' ou 'verified' |
| created_at | TIMESTAMPTZ | Data de criação |
| updated_at | TIMESTAMPTZ | Data de atualização |
| created_by | TEXT | Usuário que criou |
| notes | TEXT | Observações |

### Views

**`vw_marketplace_orders_linked`**: Visão consolidada de pedidos vinculados com detalhes de ambos os sistemas

**`vw_marketplace_sku_mappings`**: Visão de mapeamentos de SKU com detalhes dos produtos do Tiny

## APIs Disponíveis

### 1. Pedidos Não Vinculados

**GET** `/api/reports/unlinked-orders`

Retorna pedidos do marketplace que ainda não foram vinculados ao Tiny.

Query params:
- `marketplace`: 'magalu' | 'shopee' | 'mercado_livre' (obrigatório)
- `dateFrom`: Data início (ISO) (opcional)
- `dateTo`: Data fim (ISO) (opcional)
- `limit`: Limite de resultados (padrão: 100)
- `offset`: Offset para paginação (padrão: 0)

### 2. Vinculações de Pedidos

**GET** `/api/reports/order-links`

Lista pedidos vinculados com detalhes completos.

Query params:
- `marketplace`: Filtrar por marketplace (opcional)
- `dateFrom`: Data início (opcional)
- `dateTo`: Data fim (opcional)
- `limit`: Limite (padrão: 100)
- `offset`: Offset (padrão: 0)

**POST** `/api/reports/order-links`

Cria uma nova vinculação entre pedido do marketplace e pedido do Tiny.

Body:
```json
{
  "marketplace": "magalu",
  "marketplace_order_id": "123456",
  "tiny_order_id": 789,
  "linked_by": "usuario@email.com",
  "notes": "Vinculação manual"
}
```

**DELETE** `/api/reports/order-links?linkId=123`

Remove uma vinculação.

### 3. Mapeamento de SKUs

**GET** `/api/reports/sku-mappings`

Consulta mapeamentos de SKU.

Query params:
- `marketplace`: Filtrar por marketplace (opcional)
- `marketplace_sku`: Buscar SKU específico (requer marketplace)
- `tiny_product_id`: Buscar por produto do Tiny (opcional)

**POST** `/api/reports/sku-mappings`

Cria ou atualiza mapeamento de SKU.

Body (individual):
```json
{
  "marketplace": "shopee",
  "marketplace_sku": "SKU-123",
  "marketplace_product_name": "Produto X",
  "tiny_product_id": 456,
  "mapping_type": "manual"
}
```

Body (batch):
```json
{
  "batch": true,
  "mappings": [
    { "marketplace": "magalu", "marketplace_sku": "SKU1", "tiny_product_id": 111 },
    { "marketplace": "magalu", "marketplace_sku": "SKU2", "tiny_product_id": 222 }
  ]
}
```

**DELETE** `/api/reports/sku-mappings?mappingId=123`

Remove um mapeamento de SKU.

### 4. Relatório de Vendas Mensais

**GET** `/api/reports/monthly-sales`

Gera relatório de vendas mensais com breakdown de kits.

Query params:
- `year`: Ano (obrigatório)
- `month`: Mês 1-12 (obrigatório)
- `marketplace`: 'magalu' | 'shopee' | 'mercado_livre' | 'all' (padrão: 'all')

Resposta:
```json
{
  "success": true,
  "summary": {
    "period": { "year": 2024, "month": 12, "startDate": "...", "endDate": "..." },
    "marketplace": "all",
    "total_orders": 150,
    "total_items": 320,
    "total_revenue": 45678.90,
    "breakdown_by_marketplace": {
      "magalu": { "orders": 50, "items": 100, "revenue": 15000 },
      "shopee": { "orders": 60, "items": 120, "revenue": 18000 },
      "mercado_livre": { "orders": 40, "items": 100, "revenue": 12678.90 }
    },
    "breakdown_by_product_type": {
      "S": { "count": 200, "quantity": 250, "revenue": 25000 },
      "V": { "count": 80, "quantity": 100, "revenue": 12000 },
      "K": { "count": 40, "quantity": 50, "revenue": 8678.90 }
    }
  },
  "items": [
    {
      "marketplace": "magalu",
      "marketplace_order_id": "123456",
      "marketplace_order_date": "2024-12-01T10:00:00Z",
      "tiny_numero_pedido": 789,
      "tiny_product_id": 111,
      "tiny_codigo": "PROD-001",
      "tiny_nome": "Kit Exemplo",
      "tiny_tipo": "K",
      "quantity": 2,
      "unit_price": 100.00,
      "total_price": 200.00
    },
    {
      "marketplace": "magalu",
      "marketplace_order_id": "123456",
      "marketplace_order_date": "2024-12-01T10:00:00Z",
      "tiny_numero_pedido": 789,
      "tiny_product_id": 222,
      "tiny_codigo": "COMP-001",
      "tiny_nome": "Componente A",
      "tiny_tipo": "S",
      "quantity": 4,
      "unit_price": 0,
      "total_price": 0,
      "parent_product_id": 111,
      "parent_codigo": "PROD-001",
      "parent_nome": "Kit Exemplo",
      "parent_tipo": "K",
      "is_component": true
    }
  ],
  "count": 2
}
```

## Fluxo de Uso Recomendado

1. **Sincronização Inicial**
   - Sincronize pedidos do Tiny
   - Sincronize pedidos de cada marketplace (Magalu, Shopee, Mercado Livre)

2. **Vinculação de Pedidos**
   - Acesse `/relatorios/vinculos`
   - Vincule pedidos do marketplace com pedidos do Tiny
   - Priorize pedidos recentes e de maior valor

3. **Mapeamento de SKUs** (Opcional)
   - Use a API de SKU mappings para criar mapeamentos diretos
   - Útil para automação futura

4. **Geração de Relatórios**
   - Acesse `/relatorios/vendas-mensais`
   - Gere relatórios mensais
   - Analise vendas por tipo de produto (kits, variações, simples)
   - Exporte para CSV para análises adicionais

5. **Controle de Estoque**
   - Use o breakdown de componentes de kits para saber quantas unidades de cada componente foram vendidas
   - Use esses dados para pedidos de compra e reposição de estoque

## Tipos de Produto

| Código | Nome | Descrição |
|--------|------|-----------|
| S | Simples | Produto simples sem variações |
| V | Variação | Variação de um produto (ex: tamanho, cor) |
| K | Kit | Conjunto de produtos vendidos juntos |
| F | Fabricado | Produto fabricado internamente |
| M | Matéria Prima | Matéria prima para fabricação |

## Próximos Passos Sugeridos

1. **Automação de Vinculação**: Implementar lógica para tentar vincular pedidos automaticamente baseado em:
   - Data do pedido
   - Valor total
   - Nome do cliente
   - Canal de venda

2. **Interface de Mapeamento de SKUs**: Criar página UI para gerenciar mapeamentos de SKU (atualmente só via API)

3. **Relatórios Adicionais**:
   - Relatório de produtos mais vendidos por marketplace
   - Relatório de componentes mais usados em kits
   - Análise de margem por produto

4. **Alertas e Notificações**:
   - Alertar quando houver pedidos não vinculados por muito tempo
   - Notificar quando estoque de componentes de kits estiver baixo

## Suporte

Para dúvidas ou problemas, consulte os logs do sistema ou entre em contato com a equipe de desenvolvimento.
