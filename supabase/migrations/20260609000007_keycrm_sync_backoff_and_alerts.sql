-- H2 + M3 + M8: stop silently abandoning paid orders, and make status updates
-- monotonic + cursor-paged.
--
-- H2 problems fixed:
--   * keycrm_sync_attempts was incremented only by the retry cron (non-atomic
--     JS), never by markFailed or the user-triggered catch → mis-counted.
--   * Flat */10 retries, no backoff.
--   * After 5 fails an order was stuck in 'failed' forever, with no alert.
-- Fix: increment attempts inside the atomic claim RPC; add keycrm_next_retry_at
-- for exponential backoff; add terminal 'failed_permanent' (handled in code) and
-- an admin_alerts table + operator push.
--
-- M3/M8 columns: keycrm_status_changed_at (monotonic guard against poller and
-- webhook overwriting each other) and last_polled_at (poller cursor so >50
-- active orders don't starve).

-- 1. New order columns (server-managed) -------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS keycrm_next_retry_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS keycrm_status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_polled_at           TIMESTAMPTZ;

REVOKE UPDATE (keycrm_next_retry_at)     ON public.orders FROM authenticated, anon;
REVOKE UPDATE (keycrm_status_changed_at) ON public.orders FROM authenticated, anon;
REVOKE UPDATE (last_polled_at)           ON public.orders FROM authenticated, anon;

-- 2. Claim RPC: same atomic UPDATE…RETURNING, now also increments attempts and
--    schedules the next retry with exponential backoff (1m,2m,4m,8m,16m… cap 2h).
--    Backoff uses the OLD attempt count (SET RHS sees pre-update values).
CREATE OR REPLACE FUNCTION public.claim_order_for_keycrm_sync(
  p_order_id UUID,
  p_user_id  UUID
)
RETURNS SETOF public.orders
LANGUAGE sql
AS $$
  UPDATE public.orders
  SET keycrm_sync_status     = 'syncing',
      keycrm_sync_started_at = NOW(),
      keycrm_sync_attempts   = COALESCE(keycrm_sync_attempts, 0) + 1,
      keycrm_next_retry_at   = NOW()
        + LEAST(INTERVAL '2 hours',
                INTERVAL '1 minute' * POWER(2, COALESCE(keycrm_sync_attempts, 0)))
  WHERE id = p_order_id
    AND user_id = p_user_id
    AND keycrm_order_id IS NULL
    AND (
      keycrm_sync_status IS NULL
      OR keycrm_sync_status IN ('pending', 'failed')
      OR (
        keycrm_sync_status = 'syncing'
        AND (
          keycrm_sync_started_at IS NULL
          OR keycrm_sync_started_at < NOW() - INTERVAL '2 minutes'
        )
      )
    )
  RETURNING *;
$$;
-- Whitelist above intentionally excludes 'failed_permanent', 'order_created' and
-- 'order_created_unpersisted' (the latter two also carry a non-null
-- keycrm_order_id or a created KeyCRM order) so they are never re-POSTed.

REVOKE EXECUTE ON FUNCTION public.claim_order_for_keycrm_sync(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_order_for_keycrm_sync(UUID, UUID)
  TO service_role;

-- 3. Retry-selection index now includes the backoff column.
DROP INDEX IF EXISTS public.idx_orders_sync_status;
CREATE INDEX idx_orders_sync_status
  ON public.orders (keycrm_sync_status, keycrm_next_retry_at, keycrm_sync_started_at)
  WHERE keycrm_order_id IS NULL
    AND keycrm_sync_status IN ('pending', 'failed', 'syncing');

-- 4. Operator alerts (durable; the admin panel reads these via service_role).
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL,                  -- e.g. 'order_sync_failed_permanent'
  severity     TEXT NOT NULL DEFAULT 'error',  -- 'info' | 'warn' | 'error'
  order_id     UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  message      TEXT NOT NULL,
  context      JSONB,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: authenticated/anon get zero rows. The admin
-- panel reads via service_role (bypasses RLS); the mobile app never reads this.
CREATE INDEX IF NOT EXISTS idx_admin_alerts_unack
  ON public.admin_alerts (created_at) WHERE acknowledged = false;
