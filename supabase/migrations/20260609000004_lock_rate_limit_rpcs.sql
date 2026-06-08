-- M6: the per-user rate-limit RPCs were SECURITY DEFINER with no REVOKE, so the
-- Postgres default (PUBLIC EXECUTE) applied. Because p_user_id is a parameter,
-- any authenticated client could call them with ANOTHER user's id and inflate
-- that victim's daily counter — DoS'ing their onboarding (lookup), KeyCRM
-- history, or AI assistant for the rest of the day.
--
-- These RPCs are only ever invoked server-side via the service_role adminClient
-- (verified: ai-assistant, lookup-keycrm-buyer, get-keycrm-history). Lock them
-- to service_role only, mirroring claim_order_for_keycrm_sync (20260520).

REVOKE EXECUTE ON FUNCTION public.increment_ai_chat_usage(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_ai_chat_usage(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_keycrm_lookup_usage(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_keycrm_lookup_usage(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_keycrm_history_usage(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_keycrm_history_usage(UUID) TO service_role;
