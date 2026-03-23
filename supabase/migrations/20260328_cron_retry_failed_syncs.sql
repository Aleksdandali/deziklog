-- Enable extensions for cron + HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule retry every 10 minutes
SELECT cron.schedule(
  'retry-failed-syncs',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://csshbetufyocutdislkn.supabase.co/functions/v1/retry-failed-syncs',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    )
  );
  $$
);
