-- Migration: Create financial_categories table and add entity columns
-- Date: 2025-12-18

-- ============================================================================
-- PART 1: Financial Categories Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.financial_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense', 'both')),
    color VARCHAR(7) DEFAULT '#6366f1', -- Hex color for UI
    icon VARCHAR(50) DEFAULT 'tag', -- Lucide icon name
    parent_id UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL,
    is_system BOOLEAN DEFAULT FALSE, -- System categories can't be deleted
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(name, parent_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_financial_categories_type ON public.financial_categories(type);
CREATE INDEX IF NOT EXISTS idx_financial_categories_parent ON public.financial_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_financial_categories_active ON public.financial_categories(is_active);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_financial_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_financial_categories_updated_at ON public.financial_categories;
CREATE TRIGGER trigger_financial_categories_updated_at
  BEFORE UPDATE ON public.financial_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_financial_categories_updated_at();

-- RLS
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on financial_categories" ON public.financial_categories
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.financial_categories TO authenticated;
GRANT ALL ON public.financial_categories TO service_role;

-- ============================================================================
-- PART 2: Default Categories (Income)
-- ============================================================================

INSERT INTO public.financial_categories (name, type, is_system, sort_order, color, icon) VALUES
    ('Vendas', 'income', true, 1, '#10b981', 'shopping-cart'),
    ('Marketplace', 'income', true, 2, '#f59e0b', 'store'),
    ('Serviços', 'income', false, 3, '#3b82f6', 'briefcase'),
    ('Reembolsos', 'income', false, 4, '#8b5cf6', 'refresh-cw'),
    ('Juros/Rendimentos', 'income', false, 5, '#06b6d4', 'trending-up'),
    ('Outros Recebimentos', 'income', false, 6, '#64748b', 'plus-circle')
ON CONFLICT (name, parent_id) DO NOTHING;

-- ============================================================================
-- PART 3: Default Categories (Expense)
-- ============================================================================

INSERT INTO public.financial_categories (name, type, is_system, sort_order, color, icon) VALUES
    ('Custos Fixos', 'expense', true, 10, '#ef4444', 'building'),
    ('Folha de Pagamento', 'expense', true, 11, '#f97316', 'users'),
    ('Marketing', 'expense', false, 12, '#ec4899', 'megaphone'),
    ('Impostos', 'expense', true, 13, '#dc2626', 'file-text'),
    ('Logística', 'expense', false, 14, '#0ea5e9', 'truck'),
    ('Fornecedores', 'expense', false, 15, '#84cc16', 'package'),
    ('Infraestrutura', 'expense', false, 16, '#a855f7', 'server'),
    ('Taxas Marketplace', 'expense', true, 17, '#f59e0b', 'percent'),
    ('Tecnologia', 'expense', false, 18, '#6366f1', 'laptop'),
    ('Consultoria', 'expense', false, 19, '#14b8a6', 'user-check'),
    ('Outros Custos', 'expense', false, 20, '#71717a', 'minus-circle')
ON CONFLICT (name, parent_id) DO NOTHING;

-- ============================================================================
-- PART 4: Add Entity Columns to cash_flow_entries
-- ============================================================================

ALTER TABLE public.cash_flow_entries 
    ADD COLUMN IF NOT EXISTS entity_name VARCHAR(200);

ALTER TABLE public.cash_flow_entries 
    ADD COLUMN IF NOT EXISTS entity_type VARCHAR(20) 
    CHECK (entity_type IN ('client', 'supplier', 'employee', 'bank', 'government', 'other'));

ALTER TABLE public.cash_flow_entries 
    ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.financial_categories(id);

ALTER TABLE public.cash_flow_entries 
    ADD COLUMN IF NOT EXISTS cost_center VARCHAR(100);

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_cash_flow_entries_entity ON public.cash_flow_entries(entity_name);
CREATE INDEX IF NOT EXISTS idx_cash_flow_entries_entity_type ON public.cash_flow_entries(entity_type);
CREATE INDEX IF NOT EXISTS idx_cash_flow_entries_category_id ON public.cash_flow_entries(category_id);
CREATE INDEX IF NOT EXISTS idx_cash_flow_entries_cost_center ON public.cash_flow_entries(cost_center);

-- ============================================================================
-- PART 5: Cost Centers Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cost_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    budget_monthly DECIMAL(14,2),
    color VARCHAR(7) DEFAULT '#6366f1',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default cost centers
INSERT INTO public.cost_centers (name, description, color) VALUES
    ('Operações', 'Custos operacionais do dia-a-dia', '#3b82f6'),
    ('Marketing', 'Investimentos em marketing e publicidade', '#ec4899'),
    ('Tecnologia', 'Infraestrutura e ferramentas de TI', '#8b5cf6'),
    ('RH', 'Recursos humanos e folha de pagamento', '#f59e0b'),
    ('Administrativo', 'Despesas administrativas gerais', '#64748b'),
    ('Comercial', 'Equipe comercial e vendas', '#10b981')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on cost_centers" ON public.cost_centers
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;

-- ============================================================================
-- PART 6: User Preferences Table for FluxoCaixa Settings
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_fluxo_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) DEFAULT 'default', -- for future multi-user support
    visible_columns JSONB DEFAULT '["numero_pedido", "data_pedido", "cliente", "canal", "valor", "status_pagamento", "vencimento_estimado"]',
    default_filters JSONB DEFAULT '{}',
    notification_cooldown_hours INTEGER DEFAULT 4,
    rows_per_page INTEGER DEFAULT 50,
    show_categories BOOLEAN DEFAULT TRUE,
    show_entities BOOLEAN DEFAULT TRUE,
    show_cost_centers BOOLEAN DEFAULT FALSE,
    export_format VARCHAR(10) DEFAULT 'csv',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- Insert default preferences
INSERT INTO public.user_fluxo_preferences (user_id) VALUES ('default')
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.user_fluxo_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on user_fluxo_preferences" ON public.user_fluxo_preferences
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.user_fluxo_preferences TO authenticated;
GRANT ALL ON public.user_fluxo_preferences TO service_role;

COMMENT ON TABLE public.financial_categories IS 'Categories for income and expense classification';
COMMENT ON TABLE public.cost_centers IS 'Cost centers for expense attribution';
COMMENT ON TABLE public.user_fluxo_preferences IS 'User preferences for Fluxo de Caixa page';
