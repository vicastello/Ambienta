-- Create recurring_entries table for fixed monthly expenses/income
CREATE TABLE IF NOT EXISTS public.recurring_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Entry details
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    description TEXT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    category TEXT,
    subcategory TEXT,
    
    -- Recurrence settings
    frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
    day_of_month INT CHECK (day_of_month >= 1 AND day_of_month <= 31),
    day_of_week INT CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday
    
    -- Status and tracking
    is_active BOOLEAN DEFAULT TRUE,
    last_generated_at TIMESTAMPTZ,
    next_due_date DATE,
    
    -- Optional: link to supplier/customer
    entity_name TEXT,
    notes TEXT
);

-- Create index for active entries
CREATE INDEX IF NOT EXISTS idx_recurring_entries_active ON public.recurring_entries(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_recurring_entries_next_due ON public.recurring_entries(next_due_date);

-- Enable RLS
ALTER TABLE public.recurring_entries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable all operations for authenticated users" ON public.recurring_entries
    USING (true)
    WITH CHECK (true);

-- Function to calculate next due date
CREATE OR REPLACE FUNCTION calculate_next_due_date(
    p_frequency TEXT,
    p_day_of_month INT,
    p_day_of_week INT,
    p_from_date DATE DEFAULT CURRENT_DATE
) RETURNS DATE AS $$
DECLARE
    v_next DATE;
BEGIN
    IF p_frequency = 'monthly' THEN
        -- Get next occurrence of day_of_month
        v_next := date_trunc('month', p_from_date) + (COALESCE(p_day_of_month, 1) - 1) * INTERVAL '1 day';
        
        -- If that day has passed this month, go to next month
        IF v_next <= p_from_date THEN
            v_next := date_trunc('month', p_from_date + INTERVAL '1 month') + (COALESCE(p_day_of_month, 1) - 1) * INTERVAL '1 day';
        END IF;
        
        -- Handle months with fewer days
        IF EXTRACT(DAY FROM v_next) != p_day_of_month THEN
            v_next := date_trunc('month', v_next + INTERVAL '1 month') - INTERVAL '1 day';
        END IF;
        
    ELSIF p_frequency = 'weekly' THEN
        -- Get next occurrence of day_of_week
        v_next := p_from_date + (COALESCE(p_day_of_week, 0) - EXTRACT(DOW FROM p_from_date))::INT * INTERVAL '1 day';
        IF v_next <= p_from_date THEN
            v_next := v_next + INTERVAL '7 days';
        END IF;
        
    ELSIF p_frequency = 'yearly' THEN
        v_next := date_trunc('year', p_from_date) + (COALESCE(p_day_of_month, 1) - 1) * INTERVAL '1 day';
        IF v_next <= p_from_date THEN
            v_next := date_trunc('year', p_from_date + INTERVAL '1 year') + (COALESCE(p_day_of_month, 1) - 1) * INTERVAL '1 day';
        END IF;
    END IF;
    
    RETURN v_next;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update next_due_date
CREATE OR REPLACE FUNCTION update_recurring_next_due()
RETURNS TRIGGER AS $$
BEGIN
    NEW.next_due_date := calculate_next_due_date(
        NEW.frequency,
        NEW.day_of_month,
        NEW.day_of_week
    );
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recurring_next_due
    BEFORE INSERT OR UPDATE ON public.recurring_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_recurring_next_due();

-- Insert some example recurring entries (optional)
-- INSERT INTO public.recurring_entries (type, description, amount, category, frequency, day_of_month)
-- VALUES 
--     ('expense', 'Aluguel', 3500.00, 'Infraestrutura', 'monthly', 5),
--     ('expense', 'Energia Elétrica', 800.00, 'Infraestrutura', 'monthly', 15),
--     ('expense', 'Internet', 200.00, 'Infraestrutura', 'monthly', 20);
