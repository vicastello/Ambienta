-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the sync-polling function to run every 1 minute
-- This uses pg_cron to call the Supabase Edge Function via HTTP
SELECT cron.schedule(
  'sync-polling-every-minute',
  '*/1 * * * *',
  $$
  SELECT 
    net.http_post(
      url := 'https://znoiauhdrujwkfryhwiz.supabase.co/functions/v1/sync-polling',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_key')
      ),
      body := jsonb_build_object(
        'action', 'sync',
        'timestamp', now()
      )
    )
  $$
);

-- Verify the job was created
SELECT * FROM cron.job;
