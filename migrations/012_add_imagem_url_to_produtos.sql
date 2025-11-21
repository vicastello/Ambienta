-- Adicionar coluna de imagem de capa aos produtos
ALTER TABLE tiny_produtos ADD COLUMN IF NOT EXISTS imagem_url TEXT;
