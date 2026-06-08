-- K4 + M5: remove the dead "safety net" order-insert trigger.
--
-- The AFTER INSERT trigger trigger_sync_order_to_keycrm (20260332) POSTed to the
-- sync-order-to-keycrm edge function with ONLY an x-cron-secret header. But:
--   1. sync-order-to-keycrm has no [functions] block in config.toml, so it
--      inherits verify_jwt = true → the gateway 401s a request with no
--      Authorization before the function ever runs. The path was always dead.
--   2. It fired AFTER INSERT ON orders, i.e. BEFORE order_items are inserted by
--      the client, so even if it had run it would have synced an empty order
--      (M5).
--
-- Order sync is fully covered by the client fire-and-forget invoke (lib/api.ts)
-- plus the retry-failed-syncs cron (every 10 min, picks any order with
-- keycrm_sync_status IN (pending,failed,syncing) AND keycrm_order_id IS NULL).
-- Drop the dead trigger and its function.

DROP TRIGGER IF EXISTS on_order_insert_sync_keycrm ON public.orders;
DROP FUNCTION IF EXISTS public.trigger_sync_order_to_keycrm();
