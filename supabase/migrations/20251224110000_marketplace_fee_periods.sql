-- Migration: marketplace_fee_periods
-- Sistema de taxas históricas por período para marketplaces

CREATE TABLE IF NOT EXISTS public.marketplace_fee_periods (
  id SERIAL PRIMARY KEY,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('shopee', 'magalu', 'mercado_livre')),
  valid_from DATE NOT NULL,
  valid_to DATE,
  
  -- Taxas percentuais (em decimal, ex: 20.00 para 20%)
  commission_percent NUMERIC(5,2) DEFAULT 0,
  service_fee_percent NUMERIC(5,2) DEFAULT 0,
  payment_fee_percent NUMERIC(5,2) DEFAULT 0,
  
  -- Taxas fixas (em reais)
  fixed_fee_per_order NUMERIC(10,2) DEFAULT 0,
  fixed_fee_per_product NUMERIC(10,2) DEFAULT 0,
  
  -- Outras taxas
  shipping_fee_percent NUMERIC(5,2) DEFAULT 0,
  ads_fee_percent NUMERIC(5,2) DEFAULT 0,
  
  -- Metadados
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentários
COMMENT ON TABLE public.marketplace_fee_periods IS 'Histórico de taxas por marketplace com períodos de vigência';
COMMENT ON COLUMN public.marketplace_fee_periods.valid_from IS 'Data de início da vigência (inclusiva)';
COMMENT ON COLUMN public.marketplace_fee_periods.valid_to IS 'Data de fim da vigência (inclusiva). NULL = vigente até nova entrada';
COMMENT ON COLUMN public.marketplace_fee_periods.commission_percent IS 'Taxa de comissão percentual (ex: 20.00 = 20%)';
COMMENT ON COLUMN public.marketplace_fee_periods.service_fee_percent IS 'Taxa de serviço percentual (ex: 2.00 = 2%)';
COMMENT ON COLUMN public.marketplace_fee_periods.fixed_fee_per_product IS 'Taxa fixa por produto em Reais (ex: 4.00)';

-- Índices para busca eficiente
CREATE INDEX IF NOT EXISTS idx_fee_periods_lookup 
ON public.marketplace_fee_periods(marketplace, valid_from DESC);

-- Constraint unique para evitar sobreposição
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_periods_unique 
ON public.marketplace_fee_periods(marketplace, valid_from);

-- Dados iniciais com taxas atuais (Shopee padrão Out/2025+)
INSERT INTO public.marketplace_fee_periods 
(marketplace, valid_from, valid_to, commission_percent, service_fee_percent, fixed_fee_per_product, notes)
VALUES
('shopee', '2024-10-01', NULL, 20.00, 2.00, 4.00, 'Taxas vigentes desde Out/2024'),
('magalu', '2024-01-01', NULL, 16.00, 0.00, 0.00, 'Taxas Magalu padrão'),
('mercado_livre', '2024-01-01', NULL, 17.00, 0.00, 0.00, 'Taxas Mercado Livre padrão')
ON CONFLICT DO NOTHING;

-- RLS (se necessário)
ALTER TABLE public.marketplace_fee_periods ENABLE ROW LEVEL SECURITY;

-- Policy para leitura pública
CREATE POLICY "Leitura publica de taxas" ON public.marketplace_fee_periods
  FOR SELECT USING (true);

-- Policy para escrita apenas autenticados
CREATE POLICY "Escrita apenas autenticados" ON public.marketplace_fee_periods
  FOR ALL USING (auth.role() = 'authenticated');
