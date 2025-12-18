-- Migration: Create financial alerts system
-- Store alert configurations and sent alert history

-- Alert configurations table
CREATE TABLE IF NOT EXISTS financial_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Alert type
    alert_type TEXT NOT NULL CHECK (alert_type IN (
        'overdue', -- Entries past due date
        'upcoming', -- Entries due soon
        'low_balance', -- Projected balance below threshold
        'large_expense', -- Expense above threshold
        'recurring_failed', -- Recurring entry generation failed
        'payment_received', -- Order marked as paid
        'weekly_summary', -- Weekly financial summary
        'monthly_summary' -- Monthly financial summary
    )),
    
    -- Configuration
    is_enabled BOOLEAN DEFAULT true,
    threshold_value NUMERIC(12, 2), -- For balance/amount thresholds
    days_before INTEGER DEFAULT 3, -- For upcoming alerts
    
    -- Notification channels
    notify_email BOOLEAN DEFAULT true,
    notify_push BOOLEAN DEFAULT false,
    email_address TEXT,
    
    -- Schedule (for summary alerts)
    schedule_day INTEGER, -- Day of week (0-6) or day of month (1-31)
    schedule_time TIME DEFAULT '09:00',
    
    -- Metadata
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alert history table
CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID REFERENCES financial_alerts(id),
    alert_type TEXT NOT NULL,
    
    -- Alert details
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    
    -- Related entities
    related_entries UUID[], -- IDs of related cash_flow_entries
    related_orders INTEGER[], -- IDs of related tiny_orders
    
    -- Delivery status
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMPTZ,
    push_sent BOOLEAN DEFAULT false,
    push_sent_at TIMESTAMPTZ,
    
    -- User interaction
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    is_dismissed BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default alert configurations
INSERT INTO financial_alerts (alert_type, is_enabled, days_before, threshold_value, notify_email, notify_push) VALUES
    ('overdue', true, 0, NULL, true, true),
    ('upcoming', true, 3, NULL, true, false),
    ('low_balance', false, NULL, 1000, true, true),
    ('large_expense', false, NULL, 5000, true, false),
    ('weekly_summary', false, NULL, NULL, true, false),
    ('monthly_summary', false, NULL, NULL, true, false)
ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_financial_alerts_enabled ON financial_alerts(is_enabled, alert_type);
CREATE INDEX IF NOT EXISTS idx_alert_history_unread ON alert_history(is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_type ON alert_history(alert_type, created_at DESC);
