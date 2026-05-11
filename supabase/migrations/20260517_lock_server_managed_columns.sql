-- SECURITY: lock server-managed columns from direct client UPDATE.
--
-- profiles.keycrm_buyer_id is cached by edge functions (lookup-keycrm-buyer,
-- sync-order-to-keycrm) via the service_role. A malicious client could
-- previously update it to another user's KeyCRM buyer_id, causing:
--   - Their next order to attach to the wrong KeyCRM buyer record.
--   - lookup-keycrm-buyer to leak the victim's address/email on next call.
--
-- orders.keycrm_order_id / keycrm_sync_status / keycrm_sync_error / np_ttn /
-- np_delivery_cost are written exclusively by the sync edge functions. A
-- malicious client could overwrite them to break sync state or impersonate
-- a synced order.
--
-- Postgres column-level REVOKE applies to RLS-allowed UPDATEs too. The
-- service_role keeps its full grants from Supabase defaults.

REVOKE UPDATE (keycrm_buyer_id) ON public.profiles FROM authenticated, anon;

REVOKE UPDATE (
  keycrm_order_id,
  keycrm_sync_status,
  keycrm_sync_error,
  np_ttn,
  np_delivery_cost
) ON public.orders FROM authenticated, anon;
