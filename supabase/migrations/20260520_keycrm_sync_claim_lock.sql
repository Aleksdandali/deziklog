-- KeyCRM sync race-condition fix (audit findings C1 + H1).
--
-- Three concurrent paths could sync the same order:
--   1. DB trigger notify_order_change → webhook
--   2. Client supabase.functions.invoke('sync-order-to-keycrm') fire-and-forget
--   3. retry-failed-syncs cron every 5 min
--
-- syncOrderToKeyCRM had no row-level lock between SELECT and POST /order to
-- KeyCRM, so two paths could both pass the "already synced?" check and
-- create duplicate KeyCRM orders. The TTN guard at sync-logic.ts:190
-- already prevented duplicate Nova Poshta labels, but duplicate KeyCRM
-- orders were still possible.
--
-- Fix:
--   * UNIQUE partial index on keycrm_order_id — DB-level backstop.
--   * keycrm_sync_started_at column + claim_order_for_keycrm_sync() RPC —
--     atomic UPDATE-RETURNING acts as a CAS: only one worker per order
--     can hold an active "syncing" claim at a time.
--   * Claims older than 2 minutes are considered stale (e.g. crashed
--     worker) and can be re-claimed by retry-failed-syncs cron.

-- 1. Stale-claim recovery timestamp ------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS keycrm_sync_started_at TIMESTAMPTZ;

-- Server-only (matches 20260517_lock_server_managed_columns.sql intent).
REVOKE UPDATE (keycrm_sync_started_at) ON public.orders FROM authenticated, anon;

-- 2. UNIQUE backstop ---------------------------------------------------------
-- Replace the existing non-unique partial index with a UNIQUE one. If this
-- migration fails on conflict, there are already duplicate keycrm_order_id
-- values in the table — investigate before proceeding (do NOT just drop the
-- UNIQUE clause).
DROP INDEX IF EXISTS public.idx_orders_keycrm_order_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_keycrm_order_id
  ON public.orders (keycrm_order_id)
  WHERE keycrm_order_id IS NOT NULL;

-- 3. Sync-status index now also covers 'syncing' for stale-claim queries ----
DROP INDEX IF EXISTS public.idx_orders_sync_status;
CREATE INDEX idx_orders_sync_status
  ON public.orders (keycrm_sync_status, keycrm_sync_started_at)
  WHERE keycrm_order_id IS NULL
    AND keycrm_sync_status IN ('pending', 'failed', 'syncing');

-- 4. Atomic claim ------------------------------------------------------------
-- Returns 0 rows if (a) order is already synced (keycrm_order_id IS NOT NULL),
-- or (b) another worker holds an active (< 2 min old) claim.
-- Returns 1 row if we successfully took the claim; caller MUST then either
-- finish the sync (which updates status to 'synced' or 'failed' via existing
-- code in sync-logic.ts) or rely on the stale-claim window to release it.
CREATE OR REPLACE FUNCTION public.claim_order_for_keycrm_sync(
  p_order_id UUID,
  p_user_id  UUID
)
RETURNS SETOF public.orders
LANGUAGE sql
AS $$
  UPDATE public.orders
  SET keycrm_sync_status     = 'syncing',
      keycrm_sync_started_at = NOW()
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

-- Edge-function-only (called with service_role).
REVOKE EXECUTE ON FUNCTION public.claim_order_for_keycrm_sync(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_order_for_keycrm_sync(UUID, UUID)
  TO service_role;
