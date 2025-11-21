-- Tabela para armazenar produtos do Tiny ERP
CREATE TABLE IF NOT EXISTS tiny_produtos (
    id BIGSERIAL PRIMARY KEY,
    id_produto_tiny INTEGER UNIQUE NOT NULL,
    codigo TEXT,
    nome TEXT NOT NULL,
    unidade TEXT,
    preco NUMERIC(15, 2),
    preco_promocional NUMERIC(15, 2),
    saldo NUMERIC(15, 3),
    reservado NUMERIC(15, 3),
    disponivel NUMERIC(15, 3),
    situacao TEXT,
    tipo TEXT,
    gtin TEXT,
    descricao TEXT,
    ncm TEXT,
    origem TEXT,
    peso_liquido NUMERIC(15, 3),
    peso_bruto NUMERIC(15, 3),
    imagem_url TEXT,
    data_criacao_tiny TIMESTAMPTZ,
    data_atualizacao_tiny TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiny_produtos_codigo ON tiny_produtos(codigo);
CREATE INDEX IF NOT EXISTS idx_tiny_produtos_nome ON tiny_produtos USING gin(to_tsvector('portuguese', nome));
CREATE INDEX IF NOT EXISTS idx_tiny_produtos_situacao ON tiny_produtos(situacao);
CREATE INDEX IF NOT EXISTS idx_tiny_produtos_updated_at ON tiny_produtos(updated_at DESC);

-- Tabela para armazenar itens dos pedidos
CREATE TABLE IF NOT EXISTS tiny_pedido_itens (
    id BIGSERIAL PRIMARY KEY,
    id_pedido INTEGER NOT NULL REFERENCES tiny_orders(id) ON DELETE CASCADE,
    id_produto_tiny INTEGER,
    codigo_produto TEXT,
    nome_produto TEXT NOT NULL,
    quantidade NUMERIC(15, 3) NOT NULL,
    valor_unitario NUMERIC(15, 2) NOT NULL,
    valor_total NUMERIC(15, 2) NOT NULL,
    info_adicional TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT fk_produto FOREIGN KEY (id_produto_tiny) REFERENCES tiny_produtos(id_produto_tiny) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tiny_pedido_itens_pedido ON tiny_pedido_itens(id_pedido);
CREATE INDEX IF NOT EXISTS idx_tiny_pedido_itens_produto ON tiny_pedido_itens(id_produto_tiny);
CREATE INDEX IF NOT EXISTS idx_tiny_pedido_itens_codigo ON tiny_pedido_itens(codigo_produto);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_tiny_produtos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tiny_produtos_updated_at
    BEFORE UPDATE ON tiny_produtos
    FOR EACH ROW
    EXECUTE FUNCTION update_tiny_produtos_updated_at();
