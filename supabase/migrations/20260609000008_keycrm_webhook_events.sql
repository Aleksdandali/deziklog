-- H4: KeyCRM webhooks cannot be HMAC-signed and KeyCRM cannot even send custom
-- request headers — it only supports appending STATIC query params to the URL
-- (confirmed in help.keycrm.app webhook docs). So a real signature check is
-- impossible, and the previous x-webhook-secret HEADER check could never be
-- satisfied by KeyCRM (the webhook was effectively dead; status was held by the
-- 5-min poller). The realistic hardening is:
--   * accept the secret via ?secret= URL param (handled in the edge function),
--   * per-event replay/idempotency protection — KeyCRM retries each event up to
--     3 times, so dedupe on a stable (order, status, change-time) key.
--
-- service_role only (the edge function); no client access.

CREATE TABLE IF NOT EXISTS public.keycrm_webhook_events (
  dedupe_key       TEXT PRIMARY KEY,
  keycrm_order_id  BIGINT,
  event            TEXT,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.keycrm_webhook_events ENABLE ROW LEVEL SECURITY;
-- No client policies: only service_role (the webhook fn) reads/writes.

-- Housekeeping index — a 30-day retention sweep can prune on received_at.
CREATE INDEX IF NOT EXISTS idx_keycrm_webhook_events_received_at
  ON public.keycrm_webhook_events (received_at);
