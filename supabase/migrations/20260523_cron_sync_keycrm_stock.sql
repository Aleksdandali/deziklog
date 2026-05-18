-- Schedule KeyCRM → products.in_stock sync every 5 hours.
-- The function itself is idempotent: it only writes rows where the boolean
-- value actually changes, so a missed run or an extra run is harmless.
-- Cron schedule: "0 */5 * * *" → minute 0 of every 5th hour (00:00, 05:00,
-- 10:00, 15:00, 20:00 UTC). pg_cron does not support a strict "every 5h"
-- spec; this is the conventional approximation.

SELECT cron.schedule(
  'sync-keycrm-stock',
  '0 */5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://csshbetufyocutdislkn.supabase.co/functions/v1/sync-keycrm-stock',
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
