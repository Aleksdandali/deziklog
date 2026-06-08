-- K5: the daily sync-products-to-keycrm cron (20260330) sent ONLY x-cron-secret.
-- sync-products-to-keycrm has no [functions] block → verify_jwt = true, so the
-- gateway 401s the cron before the function runs → the daily catalog push never
-- happens → new products never get our UUID written into KeyCRM `sku` →
-- reconcileKeycrmIds can't map them (status no_keycrm) and the integration
-- silently rots.
--
-- Fix: reschedule with apikey + Authorization(anon) + x-cron-secret, mirroring
-- the WORKING poll-keycrm-statuses / sync-keycrm-stock crons (20260334/20260523).
-- The anon JWT only gets the request past the gateway; real auth is the in-code
-- timing-safe x-cron-secret check in sync-products-to-keycrm (verified present).

DO $$
BEGIN
  PERFORM cron.unschedule('sync-products-to-keycrm');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron job sync-products-to-keycrm not scheduled; skipping unschedule';
END $$;

SELECT cron.schedule(
  'sync-products-to-keycrm',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://csshbetufyocutdislkn.supabase.co/functions/v1/sync-products-to-keycrm',
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
