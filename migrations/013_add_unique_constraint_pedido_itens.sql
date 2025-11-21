-- Adiciona constraint única para evitar duplicação de itens do mesmo pedido
-- Isso garante que mesmo se houver tentativas simultâneas de inserção,
-- apenas um registro será mantido por combinação de pedido + produto + ordem

-- Primeiro, remover duplicatas existentes se houver
WITH duplicates AS (
  SELECT id, 
    ROW_NUMBER() OVER (
      PARTITION BY id_pedido, id_produto_tiny, codigo_produto, nome_produto
      ORDER BY created_at ASC
    ) as row_num
  FROM tiny_pedido_itens
)
DELETE FROM tiny_pedido_itens
WHERE id IN (
  SELECT id FROM duplicates WHERE row_num > 1
);

-- Adicionar constraint única composta
-- Como o mesmo produto pode aparecer múltiplas vezes no mesmo pedido (com quantidades diferentes),
-- vamos usar um hash dos dados para unicidade
ALTER TABLE tiny_pedido_itens
ADD CONSTRAINT unique_pedido_item 
UNIQUE (id_pedido, codigo_produto, quantidade, valor_unitario);

-- Criar índice para melhorar performance de verificação de existência
CREATE INDEX IF NOT EXISTS idx_tiny_pedido_itens_lookup 
ON tiny_pedido_itens(id_pedido, id_produto_tiny, codigo_produto);

-- Comentário explicativo
COMMENT ON CONSTRAINT unique_pedido_item ON tiny_pedido_itens IS 
'Garante que não haja duplicação de itens idênticos no mesmo pedido';
