-- Poll KeyCRM for order status changes every 5 minutes
SELECT cron.schedule(
  'poll-keycrm-statuses',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://csshbetufyocutdislkn.supabase.co/functions/v1/poll-keycrm-statuses',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    )
  );
  $$
);

-- Also fix retry-failed-syncs cron to include apikey + Authorization
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
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    )
  );
  $$
);
