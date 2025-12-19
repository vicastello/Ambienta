-- Add calculated value fields to tiny_orders
ALTER TABLE tiny_orders
ADD COLUMN IF NOT EXISTS valor_esperado_liquido DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS diferenca_valor DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS fees_breakdown JSONB;

-- Add indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_tiny_orders_valor_esperado ON tiny_orders(valor_esperado_liquido) WHERE valor_esperado_liquido IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tiny_orders_diferenca ON tiny_orders(diferenca_valor) WHERE diferenca_valor IS NOT NULL AND diferenca_valor != 0;

-- Add check constraint to ensure diferenca_valor logic
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_diferenca_valor_logic') THEN
        ALTER TABLE tiny_orders
        ADD CONSTRAINT check_diferenca_valor_logic 
        CHECK (
            (valor_esperado_liquido IS NULL AND diferenca_valor IS NULL) OR
            (valor_esperado_liquido IS NOT NULL)
        );
    END IF;
END
$$;

-- Add comment to explain fields
COMMENT ON COLUMN tiny_orders.valor_esperado_liquido IS 'Expected net amount after marketplace fees (gross - commission - fixed costs)';
COMMENT ON COLUMN tiny_orders.diferenca_valor IS 'Difference between expected and actual received amount (valor - valor_esperado_liquido)';
COMMENT ON COLUMN tiny_orders.fees_breakdown IS 'Detailed breakdown of marketplace fees: {commission, campaign, fixed, total, rates}';
