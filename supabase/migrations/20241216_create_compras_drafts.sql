-- Tabela para armazenar rascunho de pedido de compras
-- Única linha por draft_key (default: 'default')

CREATE TABLE IF NOT EXISTS compras_drafts (
  draft_key TEXT PRIMARY KEY DEFAULT 'default',
  pedido_overrides JSONB NOT NULL DEFAULT '{}',
  manual_items JSONB NOT NULL DEFAULT '[]',
  selected_ids JSONB NOT NULL DEFAULT '{}',
  current_order_name TEXT NOT NULL DEFAULT '',
  period_days INTEGER,
  target_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_compras_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_compras_drafts_updated_at ON compras_drafts;
CREATE TRIGGER set_compras_drafts_updated_at
  BEFORE UPDATE ON compras_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_compras_drafts_updated_at();

-- Inserir registro padrão vazio para garantir existência
INSERT INTO compras_drafts (draft_key) VALUES ('default')
ON CONFLICT (draft_key) DO NOTHING;
