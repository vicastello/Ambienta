-- =====================================================
-- TABELA: embalagens
-- Descrição: Gerenciamento de embalagens/caixas
-- =====================================================

-- Criar tabela embalagens
CREATE TABLE IF NOT EXISTS public.embalagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    altura NUMERIC(10, 2) NOT NULL,
    largura NUMERIC(10, 2) NOT NULL,
    comprimento NUMERIC(10, 2) NOT NULL,
    preco_unitario NUMERIC(10, 2) NOT NULL DEFAULT 0,
    estoque_atual NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT embalagens_codigo_unique UNIQUE (codigo)
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_embalagens_codigo ON public.embalagens(codigo);
CREATE INDEX IF NOT EXISTS idx_embalagens_nome ON public.embalagens(nome);
CREATE INDEX IF NOT EXISTS idx_embalagens_created_at ON public.embalagens(created_at DESC);

-- Criar função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_embalagens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para atualizar updated_at
CREATE TRIGGER embalagens_updated_at_trigger
    BEFORE UPDATE ON public.embalagens
    FOR EACH ROW
    EXECUTE FUNCTION public.update_embalagens_updated_at();

-- Comentários
COMMENT ON TABLE public.embalagens IS 'Tabela para gerenciamento de embalagens/caixas';
COMMENT ON COLUMN public.embalagens.codigo IS 'Código único da embalagem';
COMMENT ON COLUMN public.embalagens.nome IS 'Nome da embalagem';
COMMENT ON COLUMN public.embalagens.descricao IS 'Descrição detalhada da embalagem';
COMMENT ON COLUMN public.embalagens.altura IS 'Altura da embalagem em cm';
COMMENT ON COLUMN public.embalagens.largura IS 'Largura da embalagem em cm';
COMMENT ON COLUMN public.embalagens.comprimento IS 'Comprimento da embalagem em cm';
COMMENT ON COLUMN public.embalagens.preco_unitario IS 'Preço unitário da embalagem em reais';
COMMENT ON COLUMN public.embalagens.estoque_atual IS 'Quantidade atual em estoque';

-- =====================================================
-- TABELA: produto_embalagens
-- Descrição: Relacionamento entre produtos e embalagens
-- =====================================================

-- Criar tabela de relacionamento
CREATE TABLE IF NOT EXISTS public.produto_embalagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id BIGINT NOT NULL,
    embalagem_id UUID NOT NULL,
    quantidade NUMERIC(10, 2) NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_produto_embalagens_produto FOREIGN KEY (produto_id) REFERENCES public.tiny_produtos(id) ON DELETE CASCADE,
    CONSTRAINT fk_produto_embalagens_embalagem FOREIGN KEY (embalagem_id) REFERENCES public.embalagens(id) ON DELETE CASCADE,
    CONSTRAINT produto_embalagens_unique UNIQUE (produto_id, embalagem_id)
);

-- Criar índices para produto_embalagens
CREATE INDEX IF NOT EXISTS idx_produto_embalagens_produto_id ON public.produto_embalagens(produto_id);
CREATE INDEX IF NOT EXISTS idx_produto_embalagens_embalagem_id ON public.produto_embalagens(embalagem_id);

-- Criar trigger para atualizar updated_at em produto_embalagens
CREATE TRIGGER produto_embalagens_updated_at_trigger
    BEFORE UPDATE ON public.produto_embalagens
    FOR EACH ROW
    EXECUTE FUNCTION public.update_embalagens_updated_at();

-- Comentários
COMMENT ON TABLE public.produto_embalagens IS 'Relacionamento entre produtos e embalagens';
COMMENT ON COLUMN public.produto_embalagens.produto_id IS 'ID do produto (referência para tiny_produtos)';
COMMENT ON COLUMN public.produto_embalagens.embalagem_id IS 'ID da embalagem';
COMMENT ON COLUMN public.produto_embalagens.quantidade IS 'Quantidade de embalagens usadas por produto';

-- =====================================================
-- POLÍTICAS RLS (Row Level Security)
-- =====================================================

-- Habilitar RLS
ALTER TABLE public.embalagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_embalagens ENABLE ROW LEVEL SECURITY;

-- Políticas para embalagens (permitir todas as operações)
CREATE POLICY "Permitir leitura de embalagens" ON public.embalagens
    FOR SELECT USING (true);

CREATE POLICY "Permitir inserção de embalagens" ON public.embalagens
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização de embalagens" ON public.embalagens
    FOR UPDATE USING (true);

CREATE POLICY "Permitir exclusão de embalagens" ON public.embalagens
    FOR DELETE USING (true);

-- Políticas para produto_embalagens
CREATE POLICY "Permitir leitura de produto_embalagens" ON public.produto_embalagens
    FOR SELECT USING (true);

CREATE POLICY "Permitir inserção de produto_embalagens" ON public.produto_embalagens
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização de produto_embalagens" ON public.produto_embalagens
    FOR UPDATE USING (true);

CREATE POLICY "Permitir exclusão de produto_embalagens" ON public.produto_embalagens
    FOR DELETE USING (true);
