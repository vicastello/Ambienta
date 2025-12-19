-- Migration: Add advanced payment import tracking
-- Created: 2025-12-19

-- 1. Create payment_import_sessions table for preview workflow
CREATE TABLE IF NOT EXISTS payment_import_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES payment_upload_batches(id) ON DELETE CASCADE,
    marketplace TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('preview', 'confirmed', 'cancelled')),
    parsed_data JSONB, -- Stores preview data before confirmation
    date_range_start DATE,
    date_range_end DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_import_sessions_batch ON payment_import_sessions(batch_id);
CREATE INDEX IF NOT EXISTS idx_payment_import_sessions_status ON payment_import_sessions(status);

-- 2. Extend marketplace_payments table
ALTER TABLE marketplace_payments
ADD COLUMN IF NOT EXISTS transaction_type TEXT,
ADD COLUMN IF NOT EXISTS transaction_description TEXT,
ADD COLUMN IF NOT EXISTS is_adjustment BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_refund BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS parent_payment_id UUID REFERENCES marketplace_payments(id),
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS balance_after NUMERIC(10, 2);

CREATE INDEX IF NOT EXISTS idx_marketplace_payments_tags ON marketplace_payments USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_marketplace_payments_parent ON marketplace_payments(parent_payment_id) WHERE parent_payment_id IS NOT NULL;

-- 3. Create payment_auto_link_rules table
CREATE TABLE IF NOT EXISTS payment_auto_link_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace TEXT NOT NULL,
    transaction_type_pattern TEXT NOT NULL, -- Regex pattern
    action TEXT NOT NULL CHECK (action IN ('skip', 'auto_tag', 'link_to_expense')),
    tags TEXT[] DEFAULT '{}',
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_auto_link_rules_marketplace ON payment_auto_link_rules(marketplace);
CREATE INDEX IF NOT EXISTS idx_payment_auto_link_rules_priority ON payment_auto_link_rules(priority DESC);

-- 4. Create payment_transaction_groups table
CREATE TABLE IF NOT EXISTS payment_transaction_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_order_id TEXT NOT NULL,
    marketplace TEXT NOT NULL,
    net_balance NUMERIC(10, 2) NOT NULL DEFAULT 0,
    has_adjustments BOOLEAN DEFAULT FALSE,
    has_refunds BOOLEAN DEFAULT FALSE,
    transaction_count INTEGER DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(marketplace, marketplace_order_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_transaction_groups_order ON payment_transaction_groups(marketplace, marketplace_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transaction_groups_tags ON payment_transaction_groups USING GIN(tags);

-- 5. Extend payment_upload_batches for import history tracking
ALTER TABLE payment_upload_batches
ADD COLUMN IF NOT EXISTS date_range_start DATE,
ADD COLUMN IF NOT EXISTS date_range_end DATE,
ADD COLUMN IF NOT EXISTS payments_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payment_upload_batches_date_range ON payment_upload_batches(marketplace, date_range_start, date_range_end);

-- 6. Add triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_payment_import_sessions_updated_at ON payment_import_sessions;

CREATE TRIGGER update_payment_import_sessions_updated_at
    BEFORE UPDATE ON payment_import_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_auto_link_rules_updated_at ON payment_auto_link_rules;

CREATE TRIGGER update_payment_auto_link_rules_updated_at
    BEFORE UPDATE ON payment_auto_link_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_transaction_groups_updated_at ON payment_transaction_groups;

CREATE TRIGGER update_payment_transaction_groups_updated_at
    BEFORE UPDATE ON payment_transaction_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 7. Insert default auto-link rules for common patterns
INSERT INTO payment_auto_link_rules (marketplace, transaction_type_pattern, action, tags, priority)
VALUES
    ('shopee', '.*reembolso.*', 'auto_tag', ARRAY['reembolso'], 100),
    ('shopee', '.*ajuste.*', 'auto_tag', ARRAY['ajuste'], 90),
    ('shopee', '.*frete.*', 'auto_tag', ARRAY['frete'], 80),
    ('shopee', '.*an[uú]ncio.*', 'auto_tag', ARRAY['anuncio', 'marketing'], 70),
    ('shopee', '.*retirada.*', 'skip', ARRAY['retirada'], 60),
    ('magalu', '.*reembolso.*', 'auto_tag', ARRAY['reembolso'], 100),
    ('magalu', '.*ajuste.*', 'auto_tag', ARRAY['ajuste'], 90),
    ('mercado_livre', '.*reembolso.*', 'auto_tag', ARRAY['reembolso'], 100),
    ('mercado_livre', '.*ajuste.*', 'auto_tag', ARRAY['ajuste'], 90)
ON CONFLICT DO NOTHING;
