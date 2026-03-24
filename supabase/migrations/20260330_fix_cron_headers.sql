-- Fix: cron jobs need x-cron-secret header (not just Authorization)
-- Unschedule old job and create new one with correct headers

SELECT cron.unschedule('retry-failed-syncs');

SELECT cron.schedule(
  'retry-failed-syncs',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://csshbetufyocutdislkn.supabase.co/functions/v1/retry-failed-syncs',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    )
  );
  $$
);

-- Also add cron for sync-products-to-keycrm (daily at 3 AM)
SELECT cron.schedule(
  'sync-products-to-keycrm',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://csshbetufyocutdislkn.supabase.co/functions/v1/sync-products-to-keycrm',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    )
  );
  $$
);
