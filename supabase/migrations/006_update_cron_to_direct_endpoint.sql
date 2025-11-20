-- Update cron job to use the direct Vercel endpoint instead of Edge Function
-- This bypasses the Supabase Edge Function cache issues

-- First, unschedule the old job if it exists
SELECT cron.unschedule('sync-polling-every-minute');

-- Create the new job that calls the Vercel endpoint
SELECT cron.schedule(
  'sync-tiny-direct-every-minute',
  '*/1 * * * *',
  $$
  SELECT 
    net.http_post(
      url := 'https://gestor-tiny-qxv7irs5g-vihcastello-6133s-projects.vercel.app/api/sync/direct',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'User-Agent', 'Supabase-PgCron',
        'Authorization', 'Bearer sync-secret-token-12345'
      ),
      body := jsonb_build_object(
        'action', 'sync',
        'timestamp', now()
      )
    )
  $$
);

-- Verify the job
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'sync%';

